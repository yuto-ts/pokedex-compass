import type { ImgHTMLAttributes } from 'react';

export default function Image({
  unoptimized: _,
  alt,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) {
  // oxlint-disable-next-line nextjs/no-img-element -- replaces next/image outside Next
  return <img alt={alt} {...props} />;
}
