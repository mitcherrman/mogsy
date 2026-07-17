import { useState } from "react";
import { z } from "zod";
import { Link } from "react-router-dom";
import { Bug, MessageSquare, LifeBuoy, Mail } from "lucide-react";
import LegalLayout, { Section } from "./LegalLayout";
import { SITE_NAME } from "@/lib/site-config";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  topic: z.enum(["support", "general", "bug", "feedback", "security"]),
  message: z.string().trim().min(10, "Message is too short").max(2000),
});

type Topic = z.infer<typeof contactSchema>["topic"];

const topicOptions: { value: Topic; label: string }[] = [
  { value: "support", label: "Support" },
  { value: "general", label: "General inquiry" },
  { value: "bug", label: "Bug report" },
  { value: "feedback", label: "Community feedback" },
  { value: "security", label: "Security report" },
];

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<Topic>("general");
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
    window.location.href = `mailto:support@mogsy.app?subject=${subject}&body=${body}`;
    toast.success("Opening your email client…");
    setTimeout(() => setSubmitting(false), 800);
  }

  return (
    <LegalLayout
      title={`Contact ${SITE_NAME} — Support, Feedback, and Bug Reports`}
      description={`Get in touch with the ${SITE_NAME} team for support, general questions, bug reports, or community feedback.`}
      path="/contact"
      heading="Contact us"
      intro="We’d love to hear from you. Choose the topic that fits and we’ll get back as soon as we can."
      keywords="contact mogsy, support, bug report, feedback, vulnerability disclosure"
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <ContactCard icon={LifeBuoy} title="Support" body="Account, billing, or technical issues with the platform." />
        <ContactCard icon={Mail} title="General inquiries" body="Press, partnerships, or anything else." />
        <ContactCard icon={Bug} title="Bug reports" body="Spotted something broken? Tell us how to reproduce it." />
        <ContactCard icon={MessageSquare} title="Community feedback" body="Ideas, requests, and feedback to make Mogzy better." />
      </div>

      <Section title="Send us a message">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="topic">Topic</Label>
            <Select value={topic} onValueChange={(v) => setTopic(v as Topic)}>
              <SelectTrigger id="topic"><SelectValue /></SelectTrigger>
              <SelectContent>
                {topicOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="message">Message</Label>
            <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} rows={6} maxLength={2000} required />
          </div>
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting ? "Opening…" : "Send message"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Prefer email? Reach us directly at{" "}
          <a href="mailto:support@mogsy.app" className="text-primary underline-offset-4 hover:underline">
            support@mogsy.app
          </a>{" "}
          (our support inbox — currently hosted on our legacy mogsy.app domain). For vulnerabilities, see our{" "}
          <Link to="/security" className="text-primary underline-offset-4 hover:underline">
            security page
          </Link>
          .
        </p>
      </Section>
    </LegalLayout>
  );
}

function ContactCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
}) {
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