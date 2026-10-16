import Ask from "@/components/Ask";

export default function Home() {
  return (
    <main className="wrap ask-wrap">
      <h1 className="ask-h1">Will it appreciate?</h1>
      <p className="lede">Ask in your own words. You get one clear answer, then a few small boxes: the money, the designer, the culture, the business, the big picture.</p>
      <Ask />
    </main>
  );
}
