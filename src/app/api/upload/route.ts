import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  console.log('POST /api/upload called');
  const supabaseAdmin = getSupabaseAdmin();
  const formData = await req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    console.error('UPLOAD API: No file provided in form data.');
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  console.log(`UPLOAD API: Processing file: ${file.name}`);

  // Sanitize the filename and make it unique
  const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueFileName = `${Date.now()}_${sanitizedFileName}`;
  const filePath = `public/${uniqueFileName}`;

  // 1. Upload the file to storage
  const { error: uploadError } = await supabaseAdmin.storage
    .from('documents')
    .upload(filePath, file, {
      upsert: true,
    });

  if (uploadError) {
    console.error('UPLOAD API: Supabase storage upload error:', uploadError);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
  console.log(`UPLOAD API: File successfully uploaded to Supabase storage at path: ${filePath}`);

  // 2. Parse the document content
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  let documentText = '';
  if (file.name.endsWith('.pdf')) {
    const pdf = (await import('pdf-parse')).default;
    const parsedPdf = await pdf(fileBuffer);
    documentText = parsedPdf.text;
  } else {
    documentText = fileBuffer.toString('utf-8');
  }
  console.log(`UPLOAD API: Parsed document content, ${documentText.length} chars.`);

  // 3. Save file path and parsed content to the database
  const { data: docData, error: dbError } = await supabaseAdmin
    .from('documents')
    .insert([{ file_path: filePath, content: documentText }])
    .select()
    .single();

  if (dbError) {
    console.error('UPLOAD API: Database error creating document record:', dbError);
    return NextResponse.json({ error: 'Failed to save file path to database' }, { status: 500 });
  }
  console.log('UPLOAD API: Document record created in database:', docData);

  // 4. Create the associated chat session
  const { data: chatData, error: chatError } = await supabaseAdmin
    .from('chats')
    .insert({
      document_id: docData.id,
      chat_title: file.name,
    })
    .select()
    .single();
  
  if (chatError) {
    console.error('UPLOAD API: Database error creating chat record:', chatError);
    return NextResponse.json({ error: 'Failed to create chat session' }, { status: 500 });
  }
  console.log('UPLOAD API: Chat record created successfully:', chatData);

  console.log('--- UPLOAD API: REQUEST COMPLETED SUCCESSFULLY ---');
  return NextResponse.json({ message: 'File uploaded successfully', chat: chatData });
} 