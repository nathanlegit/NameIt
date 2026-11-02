// Video ids appear in URLs (/review/<id>) and folder names, so keep them simple.
// Its own tiny module so the web app can check ids without importing the pipeline.

const VIDEO_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidVideoId(videoId: string): boolean {
  return VIDEO_ID_PATTERN.test(videoId);
}
