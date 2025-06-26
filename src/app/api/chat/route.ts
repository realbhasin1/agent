import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// Helper to create a readable stream
function iteratorToStream(iterator: any) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
  });
}

export async function POST(req: NextRequest) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  console.log('--- CHAT (POST) API: RECEIVED REQUEST ---');
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { message, chatId } = await req.json();
    console.log(`CHAT (POST) API: Received message: "${message}" for chat ID: ${chatId}`);

    if (!message || !chatId) {
      console.error('CHAT (POST) API: Missing message or chatId.');
      return new Response('Message and Chat ID are required', { status: 400 });
    }

    // 1. Get document context from the database
    const { data: chatData, error: chatError } = await supabaseAdmin
      .from('chats')
      .select('documents(content)')
      .eq('id', chatId)
      .single();

    if (chatError || !chatData) {
      console.error('CHAT (POST) API: Error fetching chat data:', chatError);
      return new Response('Failed to find associated document', { status: 500 });
    }
    
    // Type assertion to handle strict build environments
    const doc = chatData.documents as unknown as { content: string } | null;
    const documentText = doc?.content;
    if (!documentText) {
      console.error('CHAT (POST) API: Document content is empty for chat ID:', chatId);
      return new Response('Document content is empty', { status: 500 });
    }
    console.log(`CHAT (POST) API: Retrieved parsed document with ${documentText.length} chars.`);

    // 2. Save user's message
    await supabaseAdmin.from('messages').insert({ chat_id: chatId, role: 'user', content: message });

    // 3. Call OpenAI with streaming enabled
    const responseStream = await openai.chat.completions.create({
      model: 'gpt-4o',
      stream: true,
      messages: [
        {
          role: 'system',
          content: `You are a helpful customer agent. You will be provided with the text from a document, and you should answer the user's questions based on that document. Here is the document content: \n\n${documentText}\n\nGive answers formatted in bold and in a readable format.`,
        },
        { role: 'user', content: message },
      ],
    });

    let fullResponse = '';
    const stream = iteratorToStream(
      (async function* () {
        for await (const chunk of responseStream) {
          const content = chunk.choices[0]?.delta?.content || '';
          fullResponse += content;
          yield new TextEncoder().encode(content);
        }
        
        // After streaming is complete, save the full response
        await supabaseAdmin.from('messages').insert({ chat_id: chatId, role: 'assistant', content: fullResponse });
        console.log(`CHAT (POST) API: Saved full AI response to DB for chat ${chatId}.`);
      })()
    );

    return new Response(stream);
  } catch (error) {
    console.error('CHAT (POST) API: An uncaught error occurred:', error);
    return new Response('An error occurred with the chat API', { status: 500 });
  }
} 