"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Phone, Settings } from "lucide-react";
import { PageHeader } from "@/components/pk/page";
import { SectionHeader } from "@/components/pk/bits";
import { EASE } from "@/components/pk/motion";
import { Button } from "@/components/ui/button";
import { PULKRO_CONTACT } from "@/features/configuracion/privacy-notice";
import { FlowChart } from "./flow-chart";
import { AcceptanceCriteria } from "./acceptance-criteria";
import { BusinessRules, ContactCard, Faq, PendingQuestions } from "./help-sections";
import { BUSINESS_RULES, PENDING_QUESTIONS } from "./help-content";

const SECTIONS = [
  { id: "flujo", label: "Flujo" },
  { id: "reglas", label: "Reglas de negocio" },
  { id: "criterios", label: "Criterios de aceptación" },
  { id: "pendientes", label: "Decisiones pendientes" },
  { id: "preguntas", label: "Preguntas frecuentes" },
  { id: "contacto", label: "Contacto" },
];

/** /ayuda — how the operation flows end to end, the rules behind it and what is still to be decided. */
export function HelpView() {
  const jump = (id: string) => (e: React.MouseEvent) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <div>
      <PageHeader
        title="Centro de ayuda"
        description={
          <>
            <b>15 pasos</b> desde el trabajo autorizado hasta la postventa, con <b>2 decisiones</b> que controlan el cierre. Toque un paso para ver quién lo hace, dónde
            y bajo qué regla.
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" className="h-10 rounded-[12px] border-line px-4 text-[14px] font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.05)]">
              <Link href="/configuracion">
                <Settings className="size-4" /> Configuración
              </Link>
            </Button>
            <Button asChild className="h-10 rounded-[12px] px-4 text-[14px] font-semibold">
              <a href={PULKRO_CONTACT.phoneHref}>
                <Phone className="size-4" /> Llamar a Pulkro
              </a>
            </Button>
          </>
        }
      />

      <nav aria-label="Secciones" className="scrollbar-none -mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
        {SECTIONS.map((s, i) => (
          <motion.a
            key={s.id}
            href={`#${s.id}`}
            onClick={jump(s.id)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE, delay: 0.1 + i * 0.04 }}
            className="inline-flex h-11 shrink-0 items-center rounded-full lg:h-10 border border-hairline bg-surface px-4 text-[13.5px] font-medium text-ink transition hover:border-brand-deep hover:bg-brand-deep hover:text-white"
          >
            {s.label}
          </motion.a>
        ))}
      </nav>

      <section id="flujo" className="scroll-mt-6">
        <FlowChart />
      </section>

      <section id="reglas" className="mt-14 scroll-mt-6">
        <SectionHeader title={`Reglas de negocio · ${BUSINESS_RULES.length}`} subtitle="Cada regla del negocio y cómo la aplica el prototipo." />
        <BusinessRules />
      </section>

      <section id="criterios" className="mt-14 scroll-mt-6">
        <SectionHeader title="Criterios de aceptación" subtitle="Dónde probar cada criterio, con un ejemplo real de sus datos." />
        <AcceptanceCriteria />
      </section>

      <section id="pendientes" className="mt-14 scroll-mt-6">
        <SectionHeader title={`Decisiones pendientes · ${PENDING_QUESTIONS.length}`} subtitle="Preguntas para la reunión con el desarrollador y lo que hoy supone el prototipo." />
        <PendingQuestions />
      </section>

      <section id="preguntas" className="mt-14 scroll-mt-6">
        <SectionHeader title="Preguntas frecuentes" subtitle="Lo que más preguntan supervisores y administración." />
        <Faq />
      </section>

      <section id="contacto" className="mt-14 scroll-mt-6">
        <SectionHeader title="Contacto Pulkro" subtitle="Soporte operativo y dudas sobre el servicio." />
        <ContactCard />
      </section>
    </div>
  );
}
