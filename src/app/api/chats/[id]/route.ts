import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const chatId = params.id;

  if (!chatId) {
    return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
  }

  // In a real app, you would also verify ownership of the chat before deleting.
  const { error } = await supabaseAdmin
    .from('chats')
    .delete()
    .eq('id', chatId);

  if (error) {
    console.error(`Error deleting chat ${chatId}:`, error);
    return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
  }

  return NextResponse.json({ message: 'Chat deleted successfully' });
} 