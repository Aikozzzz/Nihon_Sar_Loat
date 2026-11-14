import { Legal } from "../legal";

export default function Page() {
  return <Legal title="Terms of use">
    <h2>Study materials</h2>
    <p>Upload only materials you have permission to process. Importing a PDF sends extracted text from the selected pages to the AI provider after you approve the import.</p>
    <h2>Study content</h2>
    <p>Check extracted spellings, readings, and meanings before saving them. The app labels generated passages as AI-generated. Use the app to supplement your Japanese study.</p>
    <h2>Your account</h2>
    <p>Use an email address you control and keep your sign-in details private.</p>
  </Legal>;
}
