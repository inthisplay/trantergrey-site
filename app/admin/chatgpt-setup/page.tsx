import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { UiIcon } from '@/components/UiIcon';
import styles from './setup.module.css';

export const metadata: Metadata = {
  title: 'ChatGPT setup | TranterGrey',
  robots: { index: false, follow: false },
};

export default function ChatGptSetupPage() {
  return <main className="admin-detail"><SiteHeader adminArea /><section>
    <p className="eyebrow">Team guide / ChatGPT</p>
    <h1>Connect<br /><em>TranterGrey.</em></h1>
    <a className="admin-back" href="/admin"><UiIcon name="back" /> All management</a>
    <div className={styles.guide}>
      <p className={styles.intro}>Use Deck, videos, and Client HQ from your own ChatGPT account. Have your invitation code from Tyler ready, then follow these steps in a browser.</p>
      <ol className={styles.steps}>
        <li><h2>Open ChatGPT Plugins</h2><p>Sign into the ChatGPT account you want to use and open <a href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">chatgpt.com/plugins</a>.</p></li>
        <li><h2>Add the server</h2><p>Click <strong>+ → Add custom MCP server</strong>.</p></li>
        <li><h2>Enter these details</h2>
          <dl className={styles.details}>
            <div><dt>Name</dt><dd>TranterGrey</dd></div>
            <div><dt>Server URL</dt><dd><code>https://trantergrey-deck-mcp-trial.t-jackson.workers.dev/mcp</code></dd></div>
            <div><dt>Authentication</dt><dd>OAuth</dd></div>
            <div><dt>Client ID &amp; Client Secret</dt><dd>Leave both blank.</dd></div>
          </dl>
          <p className={styles.note}>“Trial” is just part of the server’s name. Your connection has no trial deadline.</p>
        </li>
        <li><h2>Create the plugin</h2><p>Review the permissions, acknowledge the warning, and click <strong>Create as a plugin</strong>. This connects to live company data, including tools that can change cards, notes, and to-dos.</p></li>
        <li><h2>Enter your invitation code</h2><p>On the TranterGrey authorization page, paste the code Tyler sent you into <strong>Access code</strong> and authorize. Enter it only on <strong>trantergrey-deck-mcp-trial.t-jackson.workers.dev</strong>, not in a chat or the Client Secret field.</p><p>Let the browser return to ChatGPT and finish installation.</p></li>
        <li><h2>Select TranterGrey</h2><p>Open a new chat, type <strong>@</strong>, and select <strong>TranterGrey</strong>.</p></li>
        <li><h2>Try a simple read-only check</h2><blockquote>List the Deck columns. Do not change anything.</blockquote><p>If ChatGPT returns your Deck column names using TranterGrey, you’re ready.</p></li>
      </ol>
      <aside className={styles.help}>
        <h2>Good to know</h2>
        <p>Your code works once and expires after seven days if unused. Keep it private. After connecting, access renews automatically until revoked.</p>
        <p><strong>Missing the setup option?</strong> Your ChatGPT account or workspace permissions may restrict custom plugins. Contact Tyler with the step and error you see. The current Plugins setup does not require Developer Mode.</p>
        <p><strong>Code already used or expired?</strong> Ask Tyler for a fresh invitation. Don’t delete a working connection just to retry setup.</p>
        <a href="https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt" target="_blank" rel="noreferrer">Official ChatGPT setup guide</a>
      </aside>
      <details className={styles.owner}><summary>For Tyler: send an invitation</summary><p>Open <a href="/admin/access">Admin access → AI connections</a>, select the teammate, and generate their one-time code. Send the code privately along with the link to this guide. Each person needs their own code.</p></details>
    </div>
  </section></main>;
}
