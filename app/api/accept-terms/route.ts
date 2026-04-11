import { NextResponse } from 'next/server';
import { z } from 'zod';

const AcceptTermsSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validation = AcceptTermsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const { email } = validation.data;

    return NextResponse.json({
      success: true,
      message: 'Terms acceptance recorded',
      email,
    });

  } catch (error) {
    console.error('Error in accept-terms API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
