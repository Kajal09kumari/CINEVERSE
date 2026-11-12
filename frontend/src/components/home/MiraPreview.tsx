'use client';

/**
 * MiraPreview — dedicated homepage preview introducing MIRA inside Container.
 */

import { motion } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { useMiraWidget } from '@/context/MiraWidgetContext';

const EXAMPLE_PROMPTS = [
  'Find something like Interstellar.',
  'Recommend an underrated thriller.',
  'I want a feel-good movie tonight.',
  'Suggest something under two hours.',
] as const;

export function MiraPreview() {
  const { openMira } = useMiraWidget();

  return (
    <section aria-labelledby="mira-heading">
      <Container>
        <div
          className="relative overflow-hidden rounded-2xl p-7 sm:p-10 lg:p-14"
          style={{
            background: 'linear-gradient(135deg, #17161D 0%, #1C1A23 100%)',
            border: '1px solid rgba(128,96,168,0.28)',
          }}
        >
          <div
            className="absolute -top-24 -right-24 w-80 h-80 rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(128,96,168,0.12) 0%, transparent 70%)',
            }}
            aria-hidden="true"
          />

          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Left: introduction */}
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45 }}
            >
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#8060A8]/25 border border-[#8060A8]/40">
                  <Sparkles size={15} className="text-[#A68BC7]" />
                </div>
                <span className="text-xs font-semibold tracking-[0.18em] uppercase text-[#A68BC7]">
                  MIRA · Movie Intelligence &amp; Recommendation Assistant
                </span>
              </div>

              <h2
                id="mira-heading"
                className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-[#F5F2F7] leading-tight mb-4"
                style={{ fontFamily: 'var(--font-playfair)' }}
              >
                Not sure what to watch?{' '}
                <span className="italic text-[#A68BC7]">Let MIRA figure it out.</span>
              </h2>

              <p className="text-sm sm:text-base text-[#AAA5B3] leading-relaxed mb-7 max-w-lg">
                Tell MIRA what you feel like watching. It understands your preferences
                and helps you discover something worth your time.
              </p>

              <Button
                type="button"
                onClick={() => openMira()}
                variant="primary"
                size="lg"
              >
                <Sparkles size={16} />
                Talk to MIRA
              </Button>
            </motion.div>

            {/* Right: interactive example prompts */}
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="space-y-3"
            >
              <p className="text-xs font-medium tracking-[0.14em] uppercase text-[#77727F] mb-3">
                Example prompts
              </p>
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => openMira(prompt)}
                  className="w-full text-left group flex items-center justify-between gap-3 p-4 rounded-xl bg-[#101014]/55 border border-white/[0.08] hover:border-[#8060A8]/45 transition-all duration-200"
                  aria-label={`Ask MIRA: ${prompt}`}
                >
                  <span className="text-sm text-[#AAA5B3] group-hover:text-[#F5F2F7] transition-colors">
                    &ldquo;{prompt}&rdquo;
                  </span>
                  <ArrowRight
                    size={15}
                    className="text-[#77727F] group-hover:text-[#A68BC7] flex-shrink-0 transition-colors"
                  />
                </button>
              ))}
            </motion.div>
          </div>
        </div>
      </Container>
    </section>
  );
}
