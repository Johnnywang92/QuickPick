import { describe, it, expect } from 'vitest';
import { generateRetouchHtmlReport } from './reportGenerator';
import { LocalPhoto, UserSelection } from '../types/photo';

describe('reportGenerator', () => {
  it('generates HTML report containing project name and photo items', () => {
    const mockPhoto: LocalPhoto = {
      id: 'photo_1',
      path: '/path/to/DSC001.JPG',
      filename: 'DSC001.JPG',
      fileSize: 1024000,
      format: 'jpeg',
      isRaw: false,
    };

    const mockSelection: UserSelection = {
      photoId: 'photo_1',
      state: 'selected',
      note: JSON.stringify({
        comment: '不要过度磨皮',
        presetTags: ['面部微调', '修除碎发'],
        pins: [{ id: 'p1', pinIndex: 1, x: 0.5, y: 0.4, tag: '面部微调', comment: '右脸颊轻微修饰' }],
      }),
      updatedAt: '2026-09-09T00:00:00Z',
    };

    const html = generateRetouchHtmlReport('测试相册', [
      {
        photo: mockPhoto,
        selection: mockSelection,
      },
    ]);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('测试相册');
    expect(html).toContain('DSC001.JPG');
    expect(html).toContain('面部微调');
    expect(html).toContain('右脸颊轻微修饰');
    expect(html).toContain('不要过度磨皮');
    expect(html).toContain('AI 修图基准');
  });

  it('keeps filenames with quotes out of inline JavaScript string literals', () => {
    const photo: LocalPhoto = {
      id: 'quoted',
      path: "/path/to/O'Brien.jpg",
      filename: "O'Brien.jpg",
      fileSize: 1024,
      format: 'jpeg',
      isRaw: false,
    };
    const selection: UserSelection = {
      photoId: photo.id,
      state: 'selected',
      updatedAt: '',
    };

    const html = generateRetouchHtmlReport('测试', [{ photo, selection }]);

    expect(html).toContain('data-copy-text="O&#039;Brien.jpg"');
    expect(html).toContain("onclick=\"copyText(this.dataset.copyText || '')\"");
    expect(html).not.toContain("copyText('O&#039;Brien.jpg')");
  });
});
