import { ReaderPage } from "../Reader/index.tsx";

export function OnlineChapterPage({
  bookUrl,
  sourceUrl,
  chapterUrl,
}: {
  bookUrl: string;
  sourceUrl: string;
  chapterUrl: string;
}) {
  return (
    <ReaderPage
      bookUrl={bookUrl}
      sourceUrl={sourceUrl}
      chapterUrl={chapterUrl}
    />
  );
}
