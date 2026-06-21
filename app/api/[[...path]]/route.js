import { NextResponse } from 'next/server'
import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'

const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME || 'proposal_app'

let cachedClient = null
async function getDb() {
  if (cachedClient) return cachedClient.db(DB_NAME)
  const client = new MongoClient(MONGO_URL)
  await client.connect()
  cachedClient = client
  return client.db(DB_NAME)
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }) }

export async function GET(request, { params }) {
  const path = (params?.path || []).join('/')
  try {
    if (path === '' || path === 'health') {
      return NextResponse.json({ ok: true, service: 'uma-chakri-proposal', time: new Date().toISOString() }, { headers: cors })
    }
    if (path === 'replies') {
      const db = await getDb()
      const items = await db.collection('replies').find({}).sort({ createdAt: -1 }).limit(50).toArray()
      return NextResponse.json({ items }, { headers: cors })
    }
    return NextResponse.json({ error: 'not_found', path }, { status: 404, headers: cors })
  } catch (e) {
    return NextResponse.json({ error: 'server_error', detail: String(e?.message || e) }, { status: 500, headers: cors })
  }
}

export async function POST(request, { params }) {
  const path = (params?.path || []).join('/')
  try {
    const body = await request.json().catch(() => ({}))
    if (path === 'replies') {
      const doc = {
        id: uuidv4(),
        name: String(body?.name || '').slice(0, 200),
        message: String(body?.message || '').slice(0, 5000),
        sentViaEmail: !!body?.sentViaEmail,
        userAgent: String(body?.userAgent || '').slice(0, 300),
        createdAt: new Date().toISOString(),
      }
      if (!doc.name || !doc.message) {
        return NextResponse.json({ error: 'name_and_message_required' }, { status: 400, headers: cors })
      }
      const db = await getDb()
      await db.collection('replies').insertOne(doc)
      return NextResponse.json({ ok: true, id: doc.id }, { headers: cors })
    }
    return NextResponse.json({ error: 'not_found', path }, { status: 404, headers: cors })
  } catch (e) {
    return NextResponse.json({ error: 'server_error', detail: String(e?.message || e) }, { status: 500, headers: cors })
  }
}
