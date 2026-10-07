import { useState } from "react";
import { z } from "zod";
import { Link } from "react-router-dom";
import { Bug, MessageSquare, LifeBuoy, Mail, Shield } from "lucide-react";
import LegalLayout, { Section } from "./LegalLayout";
import { SITE_NAME } from "@/lib/site-config";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const SUPPORT_EMAIL = "support@mogsy.app";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  topic: z.enum(["support", "general", "bug", "feedback", "privacy", "security"]),
  message: z.string().trim().min(10, "Message is too short").max(2000),
});

type Topic = z.infer<typeof contactSchema>["topic"];

const topicOptions: { value: Topic; label: string }[] = [
  { value: "support", label: "Account & technical support" },
  { value: "bug", label: "Bug report" },
  { value: "feedback", label: "Product feedback" },
  { value: "privacy", label: "Privacy request" },
  { value: "security", label: "Security report" },
  { value: "general", label: "General inquiry" },
];

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<Topic>("support");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = contactSchema.safeParse({ name, email, topic, message });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please review the form");
      return;
    }
    setSubmitting(true);
    const subject = encodeURIComponent(`[${topicOptions.find((t) => t.value === topic)?.label}] ${SITE_NAME} contact`);
    const body = encodeURIComponent(
      `Name: ${parsed.data.name}\nEmail: ${parsed.data.email}\nTopic: ${parsed.data.topic}\n\n${parsed.data.message}`,
    );
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    toast.success("Opening your email client…");
    setTimeout(() => setSubmitting(false), 800);
  }

  return (
    <LegalLayout
      title={`Contact ${SITE_NAME} — Support, Feedback, Privacy & Security`}
      description={`Contact ${SITE_NAME} for account or technical support, bug reports, product feedback, privacy requests, security reports, and general inquiries.`}
      path="/contact"
      heading="Contact Mogzy"
      intro="Choose the topic that best matches your request so your message includes the context we need."
      keywords="contact mogzy, mogzy support, bug report, product feedback, privacy request, vulnerability disclosure"
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <ContactCard icon={LifeBuoy} title="Support" body="Account access, billing, or technical problems using Mogzy." />
        <ContactCard icon={Bug} title="Bug reports" body="Something broken or behaving incorrectly? Include steps to reproduce it." />
        <ContactCard icon={MessageSquare} title="Product feedback" body="Ideas or feedback about Leaguecraft, Combat Simulation, Archives, Pro Play, or the wider experience." />
        <ContactCard icon={Shield} title="Privacy & security" body="Privacy-rights requests or responsible disclosure of a security issue." />
      </div>

      <Section title="Send us a message">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Your email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="topic">Topic</Label>
            <Select value={topic} onValueChange={(v) => setTopic(v as Topic)}>
              <SelectTrigger id="topic"><SelectValue /></SelectTrigger>
              <SelectContent>
                {topicOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="message">Message</Label>
            <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} rows={7} maxLength={2000} required />
          </div>
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting ? "Opening…" : "Continue in email"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          This form opens your email app with the message filled in; it does not submit
          your message directly to Mogzy. You can also email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline-offset-4 hover:underline">
            {SUPPORT_EMAIL}
          </a>
          . The support inbox currently uses Mogzy's legacy mogsy.app domain. For
          responsible disclosure guidance, see the{" "}
          <Link to="/security" className="text-primary underline-offset-4 hover:underline">security page</Link>.
        </p>
      </Section>
    </LegalLayout>
  );
}

function ContactCard({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4 flex gap-3">
      <div className="h-9 w-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <div className="font-semibold text-foreground">{title}</div>
        <p className="text-sm text-muted-foreground mt-0.5">{body}</p>
      </div>
    </div>
  );
}