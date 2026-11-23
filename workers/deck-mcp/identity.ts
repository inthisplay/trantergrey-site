import type { ApiActor } from '../../functions/_lib/internal-api';
export function mcpActor(invitation?: { id: string; nickname: string; email: string }, notifications = false): ApiActor {
  return { type: 'integration', id: invitation ? `mcp-invitation:${invitation.id}` : 'chatgpt-personal-mcp',
    name: invitation ? `${invitation.nickname} (MCP)` : 'ChatGPT personal MCP', email: invitation?.email || null,
    scopes: new Set(['cards:read','cards:write','cards:create','videos:read','associations:write','clients:read','clients:write', ...(notifications ? ['notifications:send'] : [])]) };
}
