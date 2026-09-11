import type { AnchorHTMLAttributes, Ref } from 'react';
import { pageHref } from './href';

export default function Link({
  href,
  ref,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  ref?: Ref<HTMLAnchorElement>;
}) {
  return (
    <a ref={ref} href={pageHref(href)} {...props}>
      {children}
    </a>
  );
}
