import { LocalPhoto, SceneChapter } from '../types/photo';

export type SpreadLayoutType = 'hero' | 'panoramic' | 'duo' | 'story_left' | 'story_right' | 'grid4';

export interface AlbumSpread {
  spreadIndex: number;
  leftPageNum: number;
  rightPageNum: number;
  layoutType: SpreadLayoutType;
  photos: LocalPhoto[];
  sceneName?: string;
}

export interface AlbumLayoutPlan {
  totalPhotos: number;
  totalSpreads: number;
  totalPages: number;
  spreads: AlbumSpread[];
  adviceMessage: string;
}

export function generateAlbumSpreads(
  selectedPhotos: LocalPhoto[],
  scenes: SceneChapter[] = [],
  allPhotos: LocalPhoto[] = selectedPhotos,
): AlbumLayoutPlan {
  const spreads: AlbumSpread[] = [];
  let photoPointer = 0;
  let spreadIndex = 1;

  const total = selectedPhotos.length;
  if (total === 0) {
    return {
      totalPhotos: 0,
      totalSpreads: 0,
      totalPages: 0,
      spreads: [],
      adviceMessage: '暂无已选照片，请先标记精选照片以生成画册排版预览。',
    };
  }

  while (photoPointer < total) {
    const remaining = total - photoPointer;
    const currentPhoto = selectedPhotos[photoPointer];

    // 场景区间基于完整相册索引，不能使用已选照片数组中的 photoPointer。
    const albumIndex = allPhotos.findIndex(
      (photo) => photo.id === currentPhoto.id || photo.path === currentPhoto.path,
    );
    const scene = scenes.find((s) =>
      s.photoPaths?.includes(currentPhoto.path) ||
      (albumIndex >= 0 && s.startIndex <= albumIndex && albumIndex <= s.endIndex),
    );

    let layout: SpreadLayoutType = 'duo';
    let countToTake = 2;

    if (remaining === 1) {
      // 若只有单张照片，默认采用震撼的跨页全景通栏大片；若多页中的单张余量，可为跨页全景
      layout = total === 1 ? 'panoramic' : 'hero';
      countToTake = 1;
    } else if (remaining >= 4 && spreadIndex % 3 === 0) {
      // 每隔几页来一个四图情绪画板
      layout = 'grid4';
      countToTake = 4;
    } else if (remaining >= 3) {
      // 三图故事对开：左右交替律动
      layout = spreadIndex % 2 === 1 ? 'story_left' : 'story_right';
      countToTake = 3;
    } else {
      // 经典双图对开
      layout = 'duo';
      countToTake = Math.min(2, remaining);
    }

    const spreadPhotos = selectedPhotos.slice(photoPointer, photoPointer + countToTake);
    spreads.push({
      spreadIndex,
      leftPageNum: (spreadIndex - 1) * 2 + 1,
      rightPageNum: (spreadIndex - 1) * 2 + 2,
      layoutType: layout,
      photos: spreadPhotos,
      sceneName: scene?.name,
    });

    photoPointer += countToTake;
    spreadIndex += 1;
  }

  const totalPages = spreads.length * 2;
  const adviceMessage = `当前选定的 ${total} 张照片已完美编排入 ${spreads.length} 个经典双跨页（共 ${totalPages} 个面页）。版面节奏疏密有致，极具视觉冲击力！`;

  return {
    totalPhotos: total,
    totalSpreads: spreads.length,
    totalPages,
    spreads,
    adviceMessage,
  };
}
