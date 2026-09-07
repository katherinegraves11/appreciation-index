import BriefForm from "@/components/BriefForm";

export default function Home() {
  return (
    <main className="wrap">
      <p className="eyebrow">Value-retention intelligence · luxury handbags</p>
      <h1>Which bags will still matter in five years?</h1>
      <p className="lede">
        Enter a bag and a client horizon. The Index researches resale and auction data, the house&apos;s
        financials, ownership and supply chain, the creative director, and what TikTok and search are
        saying right now, then scores it on five layers and shows its work.
      </p>
      <BriefForm />
    </main>
  );
}
