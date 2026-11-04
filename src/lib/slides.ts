import { getCollection } from 'astro:content';

export const pad = (n: number) => String(n).padStart(2, '0');

/** Слайди в порядку показу: за назвою файлу (01.md, 02.md, 02b.md, 03.md…). */
export async function getSlides() {
  const slides = await getCollection('slides');
  return slides.sort((a, b) => a.id.localeCompare(b.id, 'uk', { numeric: true }));
}
