-- EMAIL1 rollback. DESTRUCTIVE: removes the consent audit trail. Export
-- public.email_consent_events first if any real opt-in has happened — it is the
-- only evidence of what each person agreed to.

DROP FUNCTION IF EXISTS
  public.admin_newsletter_set_status(uuid, text),
  public.admin_newsletter_save_campaign(uuid, text, text, text, text, text),
  public.admin_newsletter_list_campaigns(),
  public.admin_newsletter_audience(text),
  public.admin_email_list_subscribers(text, integer, integer),
  public.admin_email_stats(),
  public.admin_email_subscription_status(uuid[]),
  public.newsletter_progress(uuid),
  public.newsletter_record_delivery(bigint, boolean, text, text, boolean),
  public.newsletter_claim_batch(uuid, integer),
  public.newsletter_begin_send(uuid, integer),
  public.newsletter_load_campaign(uuid),
  public.newsletter_audience_count(text),
  public._newsletter_eligible(text),
  public.email_apply_suppression(text, text, text, text),
  public.email_find_subscription_id(uuid, text),
  public.email_unsubscribe_preview(uuid),
  public.email_unsubscribe(uuid, text, text, text),
  public.email_set_topics(uuid, text, text[], text, text),
  public.email_confirm_subscription(text, text, text),
  public.email_request_subscription(uuid, text, text[], text, text, text, text, text, text, integer),
  public._email_log(uuid, uuid, text, text, text[], text, text, text, text, text, text, jsonb),
  public._email_topics_ok(text[]),
  public._email_mask(text),
  public._email_norm(text);

DROP TABLE IF EXISTS public.newsletter_deliveries, public.newsletter_campaigns,
  public.email_suppressions, public.email_confirmation_tokens,
  public.email_consent_events, public.email_subscriptions CASCADE;

DROP FUNCTION IF EXISTS public._email_consent_events_immutable();
