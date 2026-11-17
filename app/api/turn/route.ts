import {authUser, HttpError, jsonError} from '../../../lib/server/ai';
import {studentAccess} from '../../../lib/server/context';
import {hasTurn, parseIceServers} from '../../../lib/turn';

/** ICE servers (TURN) for the live classroom. Only for the logged-in teacher or linked student OF THIS
 *  classroom (?student=<id>), never cached, never in the repository. Configure with the server-side
 *  environment variable TURN_ICE_SERVERS (JSON array). Not set or invalid → empty list: STUN only. */
export async function GET(req: Request) {
  try {
    const {db, user} = await authUser(req);
    const studentId = new URL(req.url).searchParams.get('student') || '';
    if (!/^[0-9a-f-]{36}$/i.test(studentId)) throw new HttpError(400, 'Ongeldige leerling');
    await studentAccess(db, user.id, studentId); // 403 for anyone who is not teacher or student of this classroom
    const iceServers = parseIceServers(process.env.TURN_ICE_SERVERS);
    return Response.json({iceServers, turn: hasTurn(iceServers)}, {headers: {'Cache-Control': 'no-store, private'}});
  } catch (e) { return jsonError(e); }
}
