import { Legal } from "../legal";

export default function Page() {
  return <Legal title="Privacy policy">
    <h2>Your account and study library</h2>
    <p>The app stores your name, email, password hash, and session records to manage access to your private library. It also stores saved entries, source references, review ratings, kanji pairs, and passages. You can remove entries and saved passages from the workspace.</p>
    <h2>PDF imports and AI</h2>
    <p>When you approve an import, the app sends text extracted from your selected pages to Groq. The app deletes the raw PDF after confirmation or cancellation. Abandoned imports expire after 24 hours. Reading generation sends selected study terms, their readings and meanings, and the passage format.</p>
    <p>Groq describes how chat inference data may be retained for reliability and abuse monitoring and how its Zero Data Retention setting works. <a href="https://console.groq.com/docs/your-data">Groq data controls</a></p>
    <h2>Email</h2>
    <p>Verification and password-reset emails are delivered through Resend when email delivery is configured. The service receives the recipient address and message.</p>
  </Legal>;
}
