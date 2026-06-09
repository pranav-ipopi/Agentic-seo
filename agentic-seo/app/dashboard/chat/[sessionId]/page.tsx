import ChatWorkspace from '@/components/chat/ChatWorkspace'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ sessionId: string }>
}

export const metadata: Metadata = { title: 'Chat' }

export default async function ChatSessionPage({ params }: Props) {
  const { sessionId } = await params
  return <ChatWorkspace sessionId={sessionId} />
}
