-- PopChoice became Marquee. The first migration keeps its original filename
-- because an applied migration is history and isn't rewritten; the policies it
-- created are renamed here instead.

alter policy "popchoice read"   on documents rename to "marquee read";
alter policy "popchoice insert" on documents rename to "marquee insert";
alter policy "popchoice delete" on documents rename to "marquee delete";
