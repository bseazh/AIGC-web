import { defaultKeyframes } from "./media";
import type { KeyframeSelection } from "./types";

export function readVideoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const seconds = video.duration;
      URL.revokeObjectURL(objectUrl);
      Number.isFinite(seconds) && seconds > 0
        ? resolve(seconds)
        : reject(new Error("无法读取视频时长"));
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("无法读取视频时长，请选择可正常播放的 MP4 文件"));
    };
    video.src = objectUrl;
  });
}

export function extractFramesInBrowser(videoUrl: string, durationSeconds?: number) {
  return new Promise<KeyframeSelection[]>((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("当前浏览器无法抽取视频画面"));
      return;
    }
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("视频画面读取失败"));
    };
    video.onloadedmetadata = async () => {
      const duration = Math.min(15, Math.max(3, durationSeconds || video.duration || 15));
      const targets = defaultKeyframes(duration);
      const frames: KeyframeSelection[] = [];
      try {
        for (const target of targets) {
          await new Promise<void>((seekResolve, seekReject) => {
            const timeout = window.setTimeout(() => {
              video.onseeked = null;
              seekReject(new Error("视频定位超时"));
            }, 4000);
            video.onseeked = () => {
              window.clearTimeout(timeout);
              seekResolve();
            };
            video.currentTime = Math.min(Math.max(0, target.time), Math.max(0, video.duration - 0.05));
          });
          canvas.width = video.videoWidth || 720;
          canvas.height = video.videoHeight || 1280;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push({
            ...target,
            url: canvas.toDataURL("image/jpeg", 0.82),
          });
        }
        cleanup();
        resolve(frames);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    video.src = videoUrl;
  });
}

export function captureVideoFrameForCanvas(videoUrl: string, time: number) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("当前浏览器无法截取关键帧"));
      return;
    }
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("视频关键帧读取失败"));
    };
    video.onloadedmetadata = () => {
      const targetTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05));
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("视频关键帧定位超时"));
      }, 5000);
      video.onseeked = () => {
        window.clearTimeout(timeout);
        try {
          canvas.width = video.videoWidth || 720;
          canvas.height = video.videoHeight || 1280;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = new Image();
          image.onload = () => {
            cleanup();
            resolve(image);
          };
          image.onerror = () => {
            cleanup();
            reject(new Error("视频关键帧截图加载失败"));
          };
          image.src = canvas.toDataURL("image/jpeg", 0.86);
        } catch (error) {
          cleanup();
          reject(error);
        }
      };
      video.currentTime = targetTime;
    };
    video.src = videoUrl;
  });
}

export async function loadImageForCanvas(url: string) {
  const image = new Image();
  image.decoding = "async";
  image.crossOrigin = "anonymous";
  const objectUrl = await fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error("关键帧图片读取失败");
      return response.blob();
    })
    .then((blob) => URL.createObjectURL(blob))
    .catch(() => url);
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => {
      if (objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      if (objectUrl.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
      reject(new Error("关键帧图片加载失败"));
    };
    image.src = objectUrl;
  });
}
