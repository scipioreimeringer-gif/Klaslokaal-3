import {authUser, jsonError} from '../../../lib/server/ai';
import {parseIceServers} from '../../../lib/turn';

/** ICE servers (TURN) for the live classroom — only for logged-in users, never cached, never in the repository.
 *  Configure with the server-side environment variable TURN_ICE_SERVERS (JSON array).
 *  Not set or invalid → empty list: the classroom then uses STUN only (direct connections keep working). */
export async function GET(req: Request) {
  try {
    await authUser(req);
    return Response.json({iceServers: parseIceServers(process.env.TURN_ICE_SERVERS)}, {headers: {'Cache-Control': 'no-store, private'}});
  } catch (e) { return jsonError(e); }
}
