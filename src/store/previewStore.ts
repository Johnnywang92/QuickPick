import { create } from 'zustand';
import { getPhotoPreview } from '../services/tauriBridge';
import { LocalPhoto } from '../types/photo';

const MAX_CACHE_ENTRIES = 180;
let previewGeneration = 0;
const inFlightPreviews = new Map<string, Promise<string>>();

let prefetchQueue: LocalPhoto[] = [];
let activePrefetchWorkers = 0;
const MAX_CONCURRENT_PREFETCH = 2;

function pumpPrefetchQueue(storeGet: () => PreviewStore) {
  const currentGen = previewGeneration;
  while (activePrefetchWorkers < MAX_CONCURRENT_PREFETCH && prefetchQueue.length > 0) {
    const nextPhoto = prefetchQueue.shift();
    if (!nextPhoto) break;
    if (currentGen !== previewGeneration) {
      prefetchQueue = [];
      break;
    }
    if (storeGet().previewCache.has(nextPhoto.path)) continue;
    activePrefetchWorkers++;
    storeGet()
      .getPreview(nextPhoto)
      .catch(() => undefined)
      .finally(() => {
        activePrefetchWorkers--;
        if (currentGen === previewGeneration) {
          pumpPrefetchQueue(storeGet);
        }
      });
  }
}

function releasePreviewTexture(_url: string): void {
  // PixiCanvas 内部通过独立 ImageSource 与 8 帧 LRU 闭环管理 GPU 纹理显存，
  // 此处不再向 Pixi 全局 Assets 发起不可控的异步卸载，彻底消除切图过程中的纹理黑屏冲突。
}

interface PreviewStore {
  currentPreviewUrl: string | null;
  currentPhotoPath: string | null;
  currentPhoto: LocalPhoto | null;
  previewStatus: 'idle' | 'loading' | 'loaded' | 'error';
  previewError: string | null;
  previewCache: Map<string, string>;

  // Actions
  getPreview: (photo: LocalPhoto) => Promise<string>;
  loadPreviewForCurrent: (photo: LocalPhoto, photos?: LocalPhoto[], photoIndex?: number) => Promise<void>;
  prefetchPhotos: (photos: LocalPhoto[]) => void;
  retryCurrentPreview: () => Promise<void>;
  clearCache: () => void;
}

export const usePreviewStore = create<PreviewStore>((set, get) => ({
  currentPreviewUrl: null,
  currentPhotoPath: null,
  currentPhoto: null,
  previewStatus: 'idle',
  previewError: null,
  previewCache: new Map<string, string>(),

  getPreview: async (photo) => {
    const cached = get().previewCache.get(photo.path);
    if (cached) {
      // 原位更新 Map 迭代顺序以保持 LRU，避免分配新 Map 触发全量组件冗余重绘
      const cache = get().previewCache;
      cache.delete(photo.path);
      cache.set(photo.path, cached);
      return cached;
    }

    const generation = previewGeneration;
    const requestKey = `${generation}:${photo.id}:${photo.path}:${photo.fileSize}`;
    const existingRequest = inFlightPreviews.get(requestKey);
    if (existingRequest) return existingRequest;

    const request = getPhotoPreview(photo.path, photo.id)
      .then((url) => {
        if (generation !== previewGeneration) return url;
        const nextCache = new Map(get().previewCache);
        nextCache.set(photo.path, url);

        // 淘汰超额缓存，但绝不淘汰当前主视口正在展示的照片纹理，防止黑屏闪烁
        const currentPath = get().currentPhotoPath;
        const currentUrl = get().currentPreviewUrl;
        while (nextCache.size > MAX_CACHE_ENTRIES) {
          let candidateKey: string | undefined;
          for (const key of nextCache.keys()) {
            if (key !== currentPath) {
              candidateKey = key;
              break;
            }
          }
          if (!candidateKey) break;
          const evictedUrl = nextCache.get(candidateKey);
          nextCache.delete(candidateKey);
          if (evictedUrl && evictedUrl !== currentUrl) {
            releasePreviewTexture(evictedUrl);
          }
        }
        set({ previewCache: nextCache });
        return url;
      })
      .finally(() => inFlightPreviews.delete(requestKey));
    inFlightPreviews.set(requestKey, request);
    return request;
  },

  loadPreviewForCurrent: async (photo: LocalPhoto, photos?: LocalPhoto[], photoIndex?: number) => {
    const { currentPhotoPath, currentPreviewUrl, previewStatus } = get();
    if (currentPhotoPath === photo.path && currentPreviewUrl && previewStatus === 'loaded') {
      return;
    }

    // 从后台预取队列中移出（若存在），避免重复调度
    prefetchQueue = prefetchQueue.filter((p) => p.path !== photo.path);

    set({ currentPhotoPath: photo.path, currentPhoto: photo });

    const cached = get().previewCache.get(photo.path);
    if (cached) {
      set({
        currentPreviewUrl: cached,
        previewStatus: 'loaded',
        previewError: null,
      });
    } else {
      // 保持当前底片原位呈现，绝不清空 currentPreviewUrl，直到新图就绪瞬间替换
      set({ previewStatus: 'loading', previewError: null });
      try {
        const url = await get().getPreview(photo);
        if (get().currentPhotoPath === photo.path) {
          set({
            currentPreviewUrl: url,
            previewStatus: 'loaded',
            previewError: null,
          });
        }
      } catch (e: any) {
        if (get().currentPhotoPath === photo.path) {
          set({
            previewStatus: 'error',
            previewError: e?.toString() || '加载照片预览失败',
          });
        }
      }
    }

    // 2. 环形预加载前后照片 (前后各 2~3 张)
    if (photos && photos.length > 0) {
      const currIdx =
        photoIndex !== undefined && photoIndex >= 0 && photos[photoIndex]?.id === photo.id
          ? photoIndex
          : photos.findIndex((candidate) => candidate.id === photo.id);
      if (currIdx >= 0) {
        const prefetchIndices = [
          currIdx + 1,
          currIdx + 2,
          currIdx - 1,
          currIdx + 3,
          currIdx - 2,
        ].filter((i) => i >= 0 && i < photos.length);

        for (const idx of prefetchIndices) {
          const p = photos[idx];
          if (p && !get().previewCache.has(p.path)) {
            void get().getPreview(p).catch(() => undefined);
          }
        }
      }
    }
  },

  prefetchPhotos: (photos: LocalPhoto[]) => {
    const currentCache = get().previewCache;
    const uncached = photos.filter((p) => p && p.path && !currentCache.has(p.path));
    if (uncached.length === 0) return;

    // 将新进入视口的照片排在前面优先加载，去重过滤
    const remaining = prefetchQueue.filter(
      (q) => !uncached.some((u) => u.path === q.path),
    );
    prefetchQueue = [...uncached, ...remaining];
    if (prefetchQueue.length > 60) {
      prefetchQueue = prefetchQueue.slice(0, 60);
    }
    pumpPrefetchQueue(get);
  },

  retryCurrentPreview: async () => {
    const { currentPhoto } = get();
    if (!currentPhoto) return;
    const nextCache = new Map(get().previewCache);
    const previousUrl = nextCache.get(currentPhoto.path);
    nextCache.delete(currentPhoto.path);
    if (previousUrl) releasePreviewTexture(previousUrl);
    set({ previewCache: nextCache });
    await get().loadPreviewForCurrent(currentPhoto);
  },

  clearCache: () => {
    previewGeneration += 1;
    prefetchQueue = [];
    inFlightPreviews.clear();
    for (const url of get().previewCache.values()) releasePreviewTexture(url);
    set({
      previewCache: new Map(),
      currentPreviewUrl: null,
      currentPhotoPath: null,
      currentPhoto: null,
      previewStatus: 'idle',
      previewError: null,
    });
  },
}));
