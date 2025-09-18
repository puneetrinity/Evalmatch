/**
 * Webhook Receiver Routes
 * Handles incoming webhooks from external services like Mautic
 */

import { Router, Request, Response } from "express";
import { logger } from "../lib/logger";
import { config } from "../config/unified-config";
import { creditService } from "../services/credit-service";
import { userService } from "../services/enhanced-user-service";
import * as crypto from "crypto";

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
  // Custom fields from our auth-tracking integration
  firebase_uid?: string;
  evalmatch_user_id?: string;
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
      const signature = req.headers['webhook-signature'];
      
      // Get raw body for signature validation
      const rawBody = (req as any).rawBody;
      
      if (!rawBody) {
        logger.error("Raw body not captured for webhook signature validation");
        return res.status(500).json({ error: "Server configuration error" });
      }
      
      logger.info("Webhook signature validation", {
        hasSecret: !!process.env.MAUTIC_WEBHOOK_SECRET,
        hasSignature: !!signature,
        signatureHeader: signature ? 'present' : 'missing',
        rawBodyLength: rawBody.length,
        parsedBodyLength: JSON.stringify(payload).length
      });
      
      if (!validateMauticSignature(rawBody, signature as string)) {
        logger.warn("Invalid Mautic webhook signature", { 
          ip: req.ip, 
          signature,
          bodyLength: rawBody.length,
          bodyPreview: rawBody.substring(0, 100) + "..."
        });
        return res.status(401).json({ error: "Invalid signature" });
      }
    } else {
      logger.info("Webhook signature validation skipped - no secret configured");
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
      await processTagBasedRewards(contact.email, syncData.tags, event, contact);
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
 * Sync contact data with EvalMatch user profile using Firebase UID
 */
async function syncMauticContact(email: string, syncData: ContactSyncData): Promise<void> {
  try {
    // Find user by email in our database
    const userResult = await userService.findUserByEmail(email);
    
    if (userResult.success && userResult.data) {
      logger.info("User found for Mautic contact sync", {
        userId: userResult.data.id,
        username: userResult.data.username,
        email,
        mauticId: syncData.mauticId,
        tags: syncData.tags,
        firebaseUid: userResult.data.firebaseUid
      });
      
      // Link Mautic contact ID if we have Firebase UID and no existing Mautic link
      if (userResult.data.firebaseUid && syncData.mauticId && !userResult.data.mauticContactId) {
        const linkResult = await userService.linkMauticContact(userResult.data.firebaseUid, syncData.mauticId);
        if (linkResult.success) {
          logger.info("Successfully linked Mautic contact to user", {
            firebaseUid: userResult.data.firebaseUid,
            mauticId: syncData.mauticId
          });
        } else {
          logger.warn("Failed to link Mautic contact", {
            firebaseUid: userResult.data.firebaseUid,
            mauticId: syncData.mauticId,
            error: linkResult.error
          });
        }
      }
      
    } else {
      logger.debug("User not found for Mautic contact sync", { 
        email,
        note: "User may exist in Firebase but not yet synced to database"
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
 * Process tag-based credit rewards using Firebase UID mapping
 */
async function processTagBasedRewards(email: string, tags: string[], event?: string, contact?: MauticContact): Promise<void> {
  try {
    // Skip if credit system is not enabled
    if (!config.features.enableCreditSystem) {
      logger.debug("Credit system disabled, skipping tag-based rewards", { email });
      return;
    }

    // Try to get Firebase UID from contact custom fields first
    let firebaseUid: string | undefined;
    if (contact) {
      // Check direct properties first (from custom fields)
      firebaseUid = contact.firebase_uid || contact.evalmatch_user_id;
      
      // Check nested fields object if available
      if (!firebaseUid && contact.fields) {
        firebaseUid = contact.fields.firebase_uid || 
                     contact.fields.evalmatch_user_id || 
                     contact.fields.customFields?.firebase_uid;
      }
    }

    let userResult;
    if (firebaseUid) {
      // Primary method: Use Firebase UID lookup
      userResult = await userService.findUserByFirebaseUid(firebaseUid);
      logger.info("Looking up user by Firebase UID", {
        firebaseUid,
        found: userResult.success && !!userResult.data
      });
    } else {
      // Fallback: Use email lookup
      userResult = await userService.findUserByEmail(email);
      logger.info("Fallback to email lookup (no Firebase UID found)", {
        email,
        found: userResult.success && !!userResult.data
      });
    }
    
    if (!userResult.success || !userResult.data) {
      logger.debug("User not found for tag-based rewards", { 
        email, 
        firebaseUid,
        method: firebaseUid ? 'firebase_uid' : 'email'
      });
      return;
    }

    const user = userResult.data;
    
    // Define tag-based rewards
    const tagRewards: Record<string, { credits: number; description: string; referencePrefix: string }> = {
      'newsletter_subscriber': { 
        credits: 5, 
        description: 'Newsletter subscription bonus',
        referencePrefix: 'newsletter_sub'
      },
      'webinar_attendee': { 
        credits: 10, 
        description: 'Webinar attendance reward',
        referencePrefix: 'webinar_attend'
      },
      'survey_completed': { 
        credits: 3, 
        description: 'Survey completion bonus',
        referencePrefix: 'survey_complete'
      },
      'referral_successful': { 
        credits: 100, 
        description: 'Successful referral reward',
        referencePrefix: 'referral_success'
      },
      'premium_interest': { 
        credits: 5, 
        description: 'Premium feature interest bonus',
        referencePrefix: 'premium_interest'
      },
      'profile_complete': { 
        credits: 8, 
        description: 'Profile completion reward',
        referencePrefix: 'profile_complete'
      },
      'first_analysis': { 
        credits: 15, 
        description: 'First resume analysis bonus',
        referencePrefix: 'first_analysis'
      },
      'email_engagement': { 
        credits: 2, 
        description: 'Email engagement reward',
        referencePrefix: 'email_engage'
      }
    };
    
    // Process rewards for matching tags
    const processedRewards = [];
    for (const tag of tags) {
      const reward = tagRewards[tag];
      if (reward && user.firebaseUid) {
        // Create unique reference ID for idempotency
        const referenceId = `${reward.referencePrefix}_${user.firebaseUid}_${new Date().toISOString().split('T')[0]}`;
        
        logger.info("Processing tag-based reward", {
          email,
          firebaseUid: user.firebaseUid,
          username: user.username,
          tag,
          credits: reward.credits,
          description: reward.description,
          referenceId,
          event
        });

        try {
          const creditResult = await creditService.addCredits(
            user.firebaseUid,
            reward.credits,
            `${reward.description} (Tag: ${tag})`,
            'grant',
            referenceId,
            {
              source: 'mautic_webhook',
              tag,
              event,
              mautic_contact_id: contact?.id,
              reward_type: 'tag_based'
            }
          );

          if (creditResult.success) {
            logger.info("Tag-based reward granted successfully", {
              email,
              firebaseUid: user.firebaseUid,
              username: user.username,
              tag,
              credits: reward.credits,
              newBalance: creditResult.credits,
              referenceId
            });
            
            processedRewards.push({
              tag,
              credits: reward.credits,
              success: true,
              newBalance: creditResult.credits
            });
          } else {
            logger.warn("Failed to grant tag-based reward", {
              email,
              firebaseUid: user.firebaseUid,
              tag,
              credits: reward.credits,
              error: creditResult.error,
              referenceId
            });
            
            processedRewards.push({
              tag,
              credits: reward.credits,
              success: false,
              error: creditResult.error
            });
          }
        } catch (creditError) {
          logger.error("Exception during credit granting", {
            email,
            firebaseUid: user.firebaseUid,
            tag,
            error: creditError instanceof Error ? creditError.message : 'Unknown error',
            referenceId
          });
        }
      } else if (reward) {
        logger.warn("Cannot grant reward - missing Firebase UID", {
          email,
          username: user.username,
          tag,
          hasFirebaseUid: !!user.firebaseUid
        });
      }
    }
    
    // Log summary of processed rewards
    if (processedRewards.length > 0) {
      logger.info("Tag-based reward processing completed", {
        email,
        firebaseUid: user.firebaseUid,
        username: user.username,
        totalRewards: processedRewards.length,
        successfulRewards: processedRewards.filter(r => r.success).length,
        totalCreditsGranted: processedRewards
          .filter(r => r.success)
          .reduce((sum, r) => sum + r.credits, 0),
        rewards: processedRewards
      });
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
  
  // Grant engagement credits for email clicks
  if (config.features.enableCreditSystem) {
    await processTagBasedRewards(contact.email, ['email_engagement'], 'email.clicked', contact);
  }
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
    // Mautic uses base64-encoded HMAC-SHA256 (not hex like GitHub)
    const expectedSignature = crypto
      .createHmac('sha256', process.env.MAUTIC_WEBHOOK_SECRET)
      .update(payload)
      .digest('base64');
    
    logger.info("Signature validation debug", {
      expectedSignature,
      providedSignature: signature,
      payloadLength: payload.length,
      payloadPreview: payload.substring(0, 100) + "..."
    });
    
    // Mautic sends raw base64 signature in Webhook-Signature header
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'base64'),
      Buffer.from(signature, 'base64')
    );
  } catch (error) {
    logger.error("Signature validation error", {
      error: error instanceof Error ? error.message : 'Unknown error',
      signature,
      signatureLength: signature?.length
    });
    return false;
  }
}

export default router;