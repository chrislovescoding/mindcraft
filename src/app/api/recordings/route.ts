import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const RECORDINGS_DIR = path.join(process.cwd(), 'recordings');

// Ensure recordings directory exists
async function ensureDir() {
  try {
    await fs.access(RECORDINGS_DIR);
  } catch {
    await fs.mkdir(RECORDINGS_DIR, { recursive: true });
  }
}

// GET - List all recordings or get a specific one
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  try {
    await ensureDir();

    if (id) {
      // Get specific recording
      const filePath = path.join(RECORDINGS_DIR, `${id}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      return NextResponse.json(JSON.parse(data));
    } else {
      // List all recordings (metadata only)
      const files = await fs.readdir(RECORDINGS_DIR);
      const recordings = await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(async (file) => {
            const filePath = path.join(RECORDINGS_DIR, file);
            const data = await fs.readFile(filePath, 'utf-8');
            const recording = JSON.parse(data);
            // Return metadata only (not full tick data)
            return {
              id: recording.id,
              name: recording.name,
              startTime: recording.startTime,
              endTime: recording.endTime,
              worldGoal: recording.worldGoal,
              tickCount: recording.ticks?.length || 0,
            };
          })
      );
      return NextResponse.json(recordings);
    }
  } catch (error) {
    console.error('Error reading recordings:', error);
    return NextResponse.json({ error: 'Failed to read recordings' }, { status: 500 });
  }
}

// POST - Save a recording
export async function POST(request: NextRequest) {
  try {
    await ensureDir();

    const recording = await request.json();
    const filePath = path.join(RECORDINGS_DIR, `${recording.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(recording, null, 2));

    return NextResponse.json({ success: true, id: recording.id });
  } catch (error) {
    console.error('Error saving recording:', error);
    return NextResponse.json({ error: 'Failed to save recording' }, { status: 500 });
  }
}

// DELETE - Delete a recording
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing recording id' }, { status: 400 });
  }

  try {
    const filePath = path.join(RECORDINGS_DIR, `${id}.json`);
    await fs.unlink(filePath);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting recording:', error);
    return NextResponse.json({ error: 'Failed to delete recording' }, { status: 500 });
  }
}
