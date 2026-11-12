import { Suspense } from 'react';
import { MiraChatClient } from '@/components/assistant/MiraChatClient';
import { Container } from '@/components/ui/Container';

export default function AssistantPage() {
  return (
    <Suspense
      fallback={
        <Container className="pt-28 pb-20">
          <div className="h-[520px] rounded-2xl bg-[#17161D] border border-white/[0.08] animate-pulse" />
        </Container>
      }
    >
      <MiraChatClient />
    </Suspense>
  );
}
