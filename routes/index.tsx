import { define } from "../utils.ts";

export default define.page(function Home() {
  return (
    <main
      style={{
        fontFamily: "system-ui",
        maxWidth: "700px",
        margin: "80px auto",
        padding: "20px",
      }}
    >
      <h1>HVAC Lead Finder</h1>

      <p>
        Search Google Maps through SerpApi and collect HVAC businesses.
      </p>

      <p>Try:</p>

      <code>/search?city=Houston&state=TX</code>
    </main>
  );
});
