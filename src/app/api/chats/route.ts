import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import pdf from 'pdf-parse';

// GET: Fetch all chat sessions
export async function GET() {
  console.log('GET /api/chats called');
  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from('chats')
    .select('id, chat_title')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('GET CHATS API: Supabase error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`GET CHATS API: Successfully fetched ${data.length} chats.`);
  return NextResponse.json(data);
}

// POST: Create a new chat or add a message
export async function POST(req: NextRequest) {
  console.log('POST /api/chats called');
  const supabaseAdmin = getSupabaseAdmin();
  const body = await req.json();
  const { documentId, content } = body;

  // 1. Get document content from Supabase
  const { data: documentData, error: documentError } = await supabaseAdmin
    .storage
    .from('documents')
    .download(documentId);

  if (documentError) {
    console.error('POST CHATS API: Supabase download error:', documentError);
    return NextResponse.json({ error: documentError.message }, { status: 500 });
  }

  // 2. Parse the PDF content
  const buffer = Buffer.from(await documentData.arrayBuffer());
  let parsedPdf;
  try {
    parsedPdf = await pdf(buffer);
  } catch (e) {
    console.error('POST CHATS API: PDF parsing error:', e);
    return NextResponse.json({ error: 'Failed to parse PDF document.' }, { status: 500 });
  }
  const documentText = parsedPdf.text;

  // 3. Call OpenAI to get a response
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const stream = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: `You are a helpful assistant. Use the following document text to answer the user's question. Document: """${documentText}"""`
      },
      { role: 'user', content }
    ],
    stream: true
  });

  // 4. Create a response stream
  const responseStream = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        controller.enqueue(text);
      }
      controller.close();
    }
  });

  return new Response(responseStream, {
    headers: { 'Content-Type': 'text/plain' }
  });
}

// DELETE: Delete a chat session
export async function DELETE(req: NextRequest) {
  console.log('DELETE /api/chats called');
  const supabaseAdmin = getSupabaseAdmin();
  const { id } = await req.json();

  if (!id) {
    return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
  }

  // Also delete messages associated with the chat
  const { error: messageError } = await supabaseAdmin
    .from('messages')
    .delete()
    .eq('chat_id', id);

  if (messageError) {
    console.error('DELETE CHATS API: Supabase message delete error:', messageError);
    // Don't return here, still try to delete the chat itself
  }

  const { error } = await supabaseAdmin.from('chats').delete().eq('id', id);

  if (error) {
    console.error('DELETE CHATS API: Supabase chat delete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Chat deleted successfully' });
} 