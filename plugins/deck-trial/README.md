# TranterGrey Personal MCP

Expansion of the Deck trial, with 23 tools for the owner and invited teammates. The existing deployment URL and directory name are retained. The owner can generate copyable teammate codes in Admin Access.

## Connect or reconnect

1. Open https://chatgpt.com/plugins in a browser signed into your ChatGPT account.
2. Refresh the custom server metadata. Reconnect and review the expanded permissions. If ChatGPT retains the old `deck:create` scope, remove/recreate this custom connection.
3. For a new connection choose **+ → Add custom MCP server**; name it **TranterGrey Personal**.
4. URL: `https://trantergrey-deck-mcp-trial.t-jackson.workers.dev/mcp`.
5. OAuth with dynamic registration; leave static client ID and secret blank.
6. Enter your owner or one-time teammate invitation code on the TG consent page. Never enter a Google/ChatGPT password there.
7. Start a new chat and select the plugin.

Examples:
- How many cards moved to Done this month? Give unique cards and total moves.
- Find an unbranded link to the latest VGA video.
- Add “Create a contract” to Taylor BMW’s to-do list.
- Find the Mabra fall campaign card and show its activity.

This connection changes live data. The new `tg:personal` scope replaces `deck:create`; old tokens and outstanding grants cannot acquire expanded permissions. There is no trial deadline. Access tokens last one hour and ChatGPT can renew them automatically with rotating refresh tokens. Reconnect once after upgrading from the trial to receive a refresh token; subsequent normal renewals require no sign-in. Owner use is attributed to “ChatGPT personal MCP”; teammate use is attributed to the name assigned to the invitation. These labels do not verify the recipient’s ChatGPT identity. Teammate codes expire after seven days unused, can be redeemed once, and can be revoked independently in Admin Access.

See `docs/deck-mcp-tools.md` for the exact tool inventory and limitations. The manifests contain no credentials. No public-directory submission or teammate distribution has been performed.
