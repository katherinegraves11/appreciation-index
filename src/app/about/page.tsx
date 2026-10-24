export default function About() {
  return (
    <main>
      <section className="bookhead"><p className="lab">about</p><h1 className="vh">How we <i>decide.</i></h1><p className="hint">Every answer uses the same five ideas. Here is what each one means.</p></section>
      <div className="about">
        <h3 className="ah">The four signals</h3>
        <p className="asub">Every answer gives one of these for each: <b className="b">Buy</b> do it · <b className="w">Wait</b> not yet · <b className="d">Don&apos;t</b> not for this.</p>
        <div className="abox4">
          <div className="abox"><h4>Sell within a year</h4><p>If you sold it within a year.</p><p className="when"><b>Buy when</b> real sales beat the new price and bags sell fast.</p></div>
          <div className="abox"><h4>Hold five years</h4><p>If you kept it about five years.</p><p className="when"><b>Buy when</b> resale keeps 85%+ of the new price and demand has lasted.</p></div>
          <div className="abox"><h4>Keep ten years</h4><p>If you kept it ten years or more.</p><p className="when"><b>Buy when</b> it&apos;s a true icon with a price history to prove it.</p></div>
          <div className="abox"><h4>Just to wear</h4><p>Buy to use. Value second.</p><p className="when"><b>Buy</b> almost always. <b>Wait</b> if a price rise is near.</p></div>
        </div>
        <h3 className="ah">The dial <span className="dim">(1 · 5 · 10 years)</span></h3>
        <p className="asub">One year is the market this month. Ten years is what lasts. The question, the answer and the mood follow the dial.</p>
        <div className="abox4">
          <div className="abox"><h4>Asking vs new</h4><p>Secondhand asking price ÷ boutique price. 141% = sellers want 41% more than new.</p></div>
          <div className="abox"><h4>Heat</h4><p>Saves per listing on The RealReal. More saves, more buyers watching.</p></div>
          <div className="abox"><h4>Trend</h4><p>Which way asking prices moved since the last snapshot.</p></div>
          <div className="abox"><h4>Proven sales</h4><p>Sales we can actually see, and what they sold for against new. This turns a Wait into a Buy.</p></div>
        </div>
        <div className="abox4" style={{ marginTop: 16 }}>
          <div className="abox"><h4>Price when new</h4><p>Launch price and today&apos;s price. Rising retail lifts older bags.</p></div>
          <div className="abox"><h4>Icon status</h4><p>A shape the house keeps making for decades. Icons hold; novelties fade.</p></div>
          <div className="abox"><h4>Designer</h4><p>Who made it, and are they still there. Bags often gain value after a designer leaves.</p></div>
          <div className="abox"><h4>House</h4><p>Stable, growing, owns its workshops? Built-in scarcity lasts; marketed scarcity doesn&apos;t.</p></div>
        </div>
        <div className="abox2">
          <div className="abox"><h4>The culture board</h4><p>What TikTok and Instagram are saying about the bag: the hashtags people post, how searches for the bag are moving, and the moments people are talking about. Counts only; no posts or people are stored. The Trends page shows how much of this we have read so far.</p></div>
          <div className="abox"><h4>Ask by photo</h4><p>Drop a photo or a listing screenshot. We name the bag, you confirm, and the answer runs. Photos are read once and not kept.</p></div>
          <div className="abox"><h4>The race</h4><p>Houses on one board. <b>Up</b> = sells faster right now. <b>Right</b> = bags sold closer to the store price. Low on the board means resale pays less, not that prices are falling.</p></div>
          <div className="abox"><h4>Where the numbers come from</h4><p>Sales and asks: The RealReal, Fashionphile, Rebag, Madison Avenue Couture, Privé Porter, the auction houses. New prices: the houses and the guides that track them. Runway: Vogue. People and money: Vogue Business. Every number keeps its source.</p></div>
          <div className="abox"><h4>Which market</h4><p>The United States, in dollars. New prices are what the US boutiques charge; sales and asks come from the US resale platforms. A bag bought in Paris or Tokyo costs a different sum, and the answer is for the buyer paying in dollars.</p></div>
        </div>
        <p className="asub" style={{ marginTop: 30, fontStyle: "italic" }}>Value-retention analysis of the US market, in dollars, based on public market data, not investment advice.</p>
      </div>
    </main>
  );
}
