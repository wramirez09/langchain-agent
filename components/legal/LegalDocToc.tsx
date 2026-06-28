'use client';

import { useEffect, useRef } from 'react';
import styles from './legalDoc.module.css';

export interface TocItem {
  id: string;
  label: string;
}

interface LegalDocTocProps {
  items: TocItem[];
  /** Id of the scrollable page container the sections live in. */
  scrollRootId: string;
}

/**
 * Sticky table-of-contents with scroll-spy highlighting, ported from the
 * imported design. The page scrolls inside a nested container (`scrollRootId`),
 * so the IntersectionObserver is rooted to that element rather than the viewport.
 */
export function LegalDocToc({ items, scrollRootId }: LegalDocTocProps) {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const root = document.getElementById(scrollRootId);
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a'));
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            links.forEach((a) => {
              a.classList.toggle(
                styles.active,
                a.getAttribute('href') === `#${id}`
              );
            });
          }
        });
      },
      { root, rootMargin: '-24px 0px -65% 0px', threshold: 0 }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items, scrollRootId]);

  return (
    <nav ref={navRef} className={styles.toc} aria-label="Table of contents">
      <p className={styles.tocTitle}>On this page</p>
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`}>{item.label}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
