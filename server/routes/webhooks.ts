/**
 * Webhook Receiver Routes
 * Handles incoming webhooks from external services like Mautic
 */

import { Router, Request, Response } from "express";
import { logger } from "../lib/logger";
import { config } from "../config/unified-config";
import { creditService } from "../services/credit-service";
import { createUserService } from "../services/user-service";

const router = Router();

interface MauticContact {
  id: string;
  email: string;
  firstname?: string;
  lastname?: string;
  tags?: string[];
  fields?: Record<string, any>;
  dateAdded?: string;
  dateModified?: string;
  lastActive?: string;
}

interface MauticWebhookPayload {
  contact?: MauticContact;
  lead?: MauticContact; // Mautic sometimes uses 'lead' instead of 'contact'
  event?: string;
  timestamp?: string;
  [key: string]: any;
}

interface ContactSyncData {
  firstName?: string;
  lastName?: string;
  tags?: string[];
  lastActive?: string;
  mauticId?: string;
}

/**
 * POST /api/webhooks/mautic - Receive webhooks from Mautic
 * Handles contact updates, email events, and campaign triggers
 */
router.post("/mautic", async (req: Request, res: Response) => {
  try {
    const payload: MauticWebhookPayload = req.body;
    
    logger.info("Received Mautic webhook", {
      event: payload.event,
      timestamp: payload.timestamp,
      hasContact: !!payload.contact,
      hasLead: !!payload.lead,
      headers: req.headers,
      ip: req.ip
    });

    // Validate webhook authenticity if secret is configured
    if (process.env.MAUTIC_WEBHOOK_SECRET) {
      const signature = req.headers['x-mautic-signature'] || req.headers['x-hub-signature'];
      if (!validateMauticSignature(JSON.stringify(payload), signature as string)) {
        logger.warn("Invalid Mautic webhook signature", { ip: req.ip });
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    // Extract contact data (Mautic uses either 'contact' or 'lead')
    const contactData = payload.contact || payload.lead;
    
    if (contactData && contactData.email) {
      await processMauticContact(contactData, payload.event);
    }

    // Handle specific Mautic events
    await handleMauticEvent(payload);

    // Always respond with success to prevent Mautic retries
    res.json({ 
      received: true, 
      timestamp: new Date().toISOString(),
      processed: !!contactData?.email
    });

  } catch (error) {
    logger.error("Mautic webhook processing error", {
      error: error instanceof Error ? error.message : 'Unknown error',
      payload: req.body,
      ip: req.ip
    });

    // Still return 200 to prevent Mautic retries for processing errors
    res.json({ 
      received: true, 
      error: "Processing failed",
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Process contact data from Mautic webhook
 */
async function processMauticContact(contact: MauticContact, event?: string): Promise<void> {
  try {
    const syncData: ContactSyncData = {
      firstName: contact.firstname,
      lastName: contact.lastname,
      tags: contact.tags || [],
      lastActive: contact.lastActive,
      mauticId: contact.id
    };

    logger.info("Processing Mautic contact sync", {
      email: contact.email,
      event,
      mauticId: contact.id,
      tags: syncData.tags
    });

    await syncMauticContact(contact.email, syncData);

    // Handle tag-based rewards if credit system is enabled
    if (config.features.enableCreditSystem && syncData.tags) {
      await processTagBasedRewards(contact.email, syncData.tags, event);
    }

  } catch (error) {
    logger.error("Contact sync processing failed", {
      email: contact.email,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Handle specific Mautic events
 */
async function handleMauticEvent(payload: MauticWebhookPayload): Promise<void> {
  const { event, contact, lead } = payload;
  const contactData = contact || lead;

  if (!event || !contactData?.email) return;

  logger.info("Processing Mautic event", {
    event,
    email: contactData.email,
    mauticId: contactData.id
  });

  try {
    switch (event) {
      case 'contact.identified':
      case 'lead.identified':
        await handleContactIdentified(contactData);
        break;
      
      case 'contact.added_to_campaign':
      case 'lead.added_to_campaign':
        await handleCampaignEnrollment(contactData, payload);
        break;
      
      case 'email.sent':
        await handleEmailSent(contactData, payload);
        break;
      
      case 'email.opened':
        await handleEmailOpened(contactData, payload);
        break;
      
      case 'email.clicked':
        await handleEmailClicked(contactData, payload);
        break;
      
      case 'form.submitted':
        await handleFormSubmission(contactData, payload);
        break;
      
      default:
        logger.debug("Unhandled Mautic event", { event, email: contactData.email });
    }
  } catch (error) {
    logger.error("Event handling failed", {
      event,
      email: contactData.email,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Sync contact data with EvalMatch user profile
 * Note: Limited sync due to basic user schema - mainly logs the contact for future reference
 */
async function syncMauticContact(email: string, syncData: ContactSyncData): Promise<void> {
  try {
    const userService = createUserService();
    
    // Find user by email (if email exists in users table)
    const userResult = await userService.findUserByEmail(email);
    
    if (userResult.success && userResult.data) {
      logger.info("User found for Mautic contact sync", {
        userId: userResult.data.id,
        username: userResult.data.username,
        email,
        mauticId: syncData.mauticId,
        tags: syncData.tags
      });
      
      // TODO: When user schema is extended, update user profile with Mautic data
      // For now, we just log the sync event for tracking
    } else {
      logger.debug("User not found for Mautic contact sync", { 
        email,
        note: "User may exist in Firebase but not in local users table"
      });
    }
    
  } catch (error) {
    logger.error("Contact sync failed", {
      email,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Process tag-based credit rewards
 */
async function processTagBasedRewards(email: string, tags: string[], event?: string): Promise<void> {
  try {
    const userService = createUserService();
    const userResult = await userService.findUserByEmail(email);
    
    if (!userResult.success || !userResult.data) {
      logger.debug("User not found for tag-based rewards", { email });
      return;
    }
    
    // Log the reward event but don't process credits yet
    // TODO: Process credits when proper Firebase UID -> username mapping is implemented
    logger.info("Tag-based reward opportunity identified", {
      email,
      username: userIdentifier,
      tags,
      event,
      note: "Credit processing disabled until proper user mapping is implemented"
    });
    
    // Define tag-based rewards for future implementation
    const tagRewards: Record<string, { credits: number; description: string }> = {
      'newsletter_subscriber': { credits: 5, description: 'Newsletter subscription bonus' },
      'webinar_attendee': { credits: 10, description: 'Webinar attendance reward' },
      'survey_completed': { credits: 3, description: 'Survey completion bonus' },
      'referral_successful': { credits: 25, description: 'Successful referral reward' },
      'premium_interest': { credits: 5, description: 'Premium feature interest bonus' }
    };
    
    // Log potential rewards for tracking
    for (const tag of tags) {
      const reward = tagRewards[tag];
      if (reward) {
        logger.info("Potential tag-based reward", {
          email,
          username: userIdentifier,
          tag,
          potentialCredits: reward.credits,
          description: reward.description
        });
      }
    }
    
  } catch (error) {
    logger.error("Tag-based reward processing failed", {
      email,
      tags,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Event handlers for specific Mautic events
 */

async function handleContactIdentified(contact: MauticContact): Promise<void> {
  logger.info("Contact identified in Mautic", {
    email: contact.email,
    mauticId: contact.id
  });
  // Could trigger welcome email or onboarding sequence
}

async function handleCampaignEnrollment(contact: MauticContact, payload: MauticWebhookPayload): Promise<void> {
  logger.info("Contact added to campaign", {
    email: contact.email,
    campaign: payload.campaign_id || payload.campaignId
  });
  // Could trigger campaign-specific rewards or tracking
}

async function handleEmailSent(contact: MauticContact, payload: MauticWebhookPayload): Promise<void> {
  logger.debug("Email sent to contact", {
    email: contact.email,
    emailId: payload.email_id || payload.emailId
  });
}

async function handleEmailOpened(contact: MauticContact, payload: MauticWebhookPayload): Promise<void> {
  logger.info("Email opened by contact", {
    email: contact.email,
    emailId: payload.email_id || payload.emailId
  });
  // Could trigger engagement-based rewards
}

async function handleEmailClicked(contact: MauticContact, payload: MauticWebhookPayload): Promise<void> {
  logger.info("Email link clicked by contact", {
    email: contact.email,
    emailId: payload.email_id || payload.emailId,
    url: payload.url
  });
  // High engagement - could trigger bonus credits
}

async function handleFormSubmission(contact: MauticContact, payload: MauticWebhookPayload): Promise<void> {
  logger.info("Form submitted by contact", {
    email: contact.email,
    formId: payload.form_id || payload.formId
  });
  // Could trigger form-specific rewards or lead scoring
}

/**
 * Validate Mautic webhook signature for security
 */
function validateMauticSignature(payload: string, signature: string): boolean {
  if (!signature || !process.env.MAUTIC_WEBHOOK_SECRET) return false;
  
  try {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', process.env.MAUTIC_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');
    
    // Support both GitHub-style (sha256=) and raw hex formats
    const providedSignature = signature.startsWith('sha256=') 
      ? signature.slice(7) 
      : signature;
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );
  } catch (error) {
    logger.error("Signature validation error", {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}

export default router;