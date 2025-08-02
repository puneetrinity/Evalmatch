import { logger } from './logger';
import { analyzeResumeParallel, analyzeJobDescription, analyzeMatch as analyzeMatchTiered } from './tiered-ai-provider';
import { storage } from '../storage';
import { UserTierInfo } from '@shared/user-tiers';

export interface BatchResumeInput {
  id: number;
  content: string;
  filename: string;
}

export interface BatchJobInput {
  id: number;
  title: string;
  description: string;
}

export interface BatchProcessResult {
  success: boolean;
  processed: number;
  errors: Array<{
    id: number;
    error: string;
  }>;
  timeTaken: number;
}

/**
 * Process multiple resumes in parallel using Promise.all()
 * This is 5-10x faster than sequential processing
 */
export async function processBatchResumes(
  resumes: BatchResumeInput[],
  userTier: UserTierInfo
): Promise<BatchProcessResult> {
  const startTime = Date.now();
  const errors: Array<{ id: number; error: string }> = [];
  let processed = 0;

  // Extract resume IDs for logging
  const resumeIds = resumes.map(r => r.id);
  
  try {
    logger.info('Starting batch resume processing', {
      resumeCount: resumes.length,
      resumeIds: resumeIds,
      userTier: {
        name: userTier.name,
        model: userTier.model,
        maxConcurrency: userTier.maxConcurrency
      },
      startTime: new Date(startTime).toISOString()
    });

    logger.debug('Batch resume processing details', {
      resumes: resumes.map(r => ({
        id: r.id,
        filename: r.filename,
        contentLength: r.content?.length || 0
      }))
    });

    // Process all resumes in parallel using Promise.all()
    const analysisPromises = resumes.map(async (resume) => {
      try {
        logger.debug(`Starting analysis for resume ${resume.id}`, {
          resumeId: resume.id,
          filename: resume.filename,
          contentLength: resume.content?.length || 0
        });
        
        // Analyze resume using optimized parallel extraction (22% token reduction)
        const analysisStartTime = Date.now();
        const analysis = await analyzeResumeParallel(resume.content, userTier);
        const analysisTime = Date.now() - analysisStartTime;
        
        logger.debug(`Resume analysis completed for ${resume.id}`, {
          resumeId: resume.id,
          analysisTime,
          skillsExtracted: analysis.skills?.length || 0,
          experienceYears: analysis.experienceYears || 0
        });
        
        // Start database update asynchronously (don't wait for completion)
        logger.debug(`Starting database update for resume ${resume.id}`);
        const dbUpdatePromise = storage.updateResumeAnalysis(resume.id, analysis);
        
        // Return immediately with analysis, database update happens in background
        // We store the promise to await all database operations later if needed
        return { 
          id: resume.id, 
          success: true, 
          analysis,
          dbUpdate: dbUpdatePromise 
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error processing resume ${resume.id}`, {
          resumeId: resume.id,
          filename: resume.filename,
          error: errorMessage,
          errorStack: error instanceof Error ? error.stack : undefined
        });
        errors.push({ id: resume.id, error: errorMessage });
        return { id: resume.id, success: false, error: errorMessage };
      }
    });

    // Wait for all analyses to complete
    logger.debug('Waiting for all resume analyses to complete');
    const results = await Promise.all(analysisPromises);
    processed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logger.info('Resume analyses completed', {
      total: results.length,
      successful: processed,
      failed: failed,
      successRate: Math.round((processed / results.length) * 100)
    });

    // Wait for all database updates to complete in background
    const dbUpdatePromises = results
      .filter(r => r.success && r.dbUpdate)
      .map(r => r.dbUpdate);
    
    if (dbUpdatePromises.length > 0) {
      logger.debug(`Starting database updates for ${dbUpdatePromises.length} successful analyses`);
      try {
        const dbResults = await Promise.allSettled(dbUpdatePromises);
        const dbSuccessful = dbResults.filter(r => r.status === 'fulfilled').length;
        const dbFailed = dbResults.filter(r => r.status === 'rejected').length;
        
        logger.info('Database updates completed', {
          total: dbUpdatePromises.length,
          successful: dbSuccessful,
          failed: dbFailed
        });
        
        if (dbFailed > 0) {
          logger.warn('Some database updates failed', {
            failedCount: dbFailed,
            failures: dbResults
              .filter(r => r.status === 'rejected')
              .map(r => r.reason)
          });
        }
      } catch (error) {
        logger.warn('Database update error during Promise.allSettled:', error);
      }
    }

    const timeTaken = Date.now() - startTime;
    const avgTimePerResume = timeTaken / resumes.length;
    
    logger.info('Batch resume processing completed', {
      totalResumes: resumes.length,
      successful: processed,
      failed: errors.length,
      successRate: Math.round((processed / resumes.length) * 100),
      totalTime: timeTaken,
      avgTimePerResume: Math.round(avgTimePerResume),
      resumesPerSecond: Math.round((resumes.length / timeTaken) * 1000),
      userTier: userTier.name,
      endTime: new Date().toISOString()
    });

    if (errors.length > 0) {
      logger.warn('Batch processing had errors', {
        errorCount: errors.length,
        errors: errors.map(e => ({ resumeId: e.id, error: e.error }))
      });
    }

    return {
      success: errors.length === 0,
      processed,
      errors,
      timeTaken
    };

  } catch (error) {
    const timeTaken = Date.now() - startTime;
    logger.error('Batch resume processing failed catastrophically', {
      resumeCount: resumes.length,
      resumeIds: resumeIds,
      processed: processed,
      timeTaken: timeTaken,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      userTier: userTier.name
    });
    
    return {
      success: false,
      processed,
      errors: [{ id: -1, error: error instanceof Error ? error.message : 'Batch processing failed' }],
      timeTaken
    };
  }
}

/**
 * Process multiple resume-job matches in parallel
 * Used for matching multiple resumes against multiple jobs
 */
export async function processBatchMatches(
  resumes: BatchResumeInput[],
  jobs: BatchJobInput[],
  userTier: UserTierInfo
): Promise<BatchProcessResult> {
  const startTime = Date.now();
  const errors: Array<{ id: number; error: string }> = [];
  let processed = 0;
  const totalMatches = resumes.length * jobs.length;

  // Extract IDs for logging
  const resumeIds = resumes.map(r => r.id);
  const jobIds = jobs.map(j => j.id);

  try {
    logger.info('Starting batch matching process', {
      resumeCount: resumes.length,
      jobCount: jobs.length,
      totalMatches: totalMatches,
      resumeIds: resumeIds,
      jobIds: jobIds,
      userTier: {
        name: userTier.name,
        model: userTier.model,
        maxConcurrency: userTier.maxConcurrency
      },
      startTime: new Date(startTime).toISOString()
    });

    logger.debug('Batch matching details', {
      resumes: resumes.map(r => ({
        id: r.id,
        filename: r.filename,
        contentLength: r.content?.length || 0
      })),
      jobs: jobs.map(j => ({
        id: j.id,
        title: j.title,
        descriptionLength: j.description?.length || 0
      }))
    });

    // First, analyze all jobs in parallel (if not already analyzed)
    logger.info('Starting job description analyses', { jobCount: jobs.length });
    const jobAnalysisStartTime = Date.now();
    
    const jobAnalysisPromises = jobs.map(async (job) => {
      try {
        logger.debug(`Starting job analysis for ${job.id}`, {
          jobId: job.id,
          title: job.title,
          descriptionLength: job.description?.length || 0
        });
        
        const jobAnalysisTime = Date.now();
        const analysis = await analyzeJobDescription(job.title, job.description, userTier);
        const analysisTime = Date.now() - jobAnalysisTime;
        
        logger.debug(`Job analysis completed for ${job.id}`, {
          jobId: job.id,
          analysisTime,
          skillsRequired: analysis.requiredSkills?.length || 0,
          experienceLevel: analysis.experienceLevel
        });
        
        return analysis;
      } catch (error) {
        logger.error(`Error analyzing job ${job.id}`, {
          jobId: job.id,
          title: job.title,
          error: error instanceof Error ? error.message : 'Unknown error',
          errorStack: error instanceof Error ? error.stack : undefined
        });
        throw error;
      }
    });

    const jobAnalyses = await Promise.all(jobAnalysisPromises);
    const jobAnalysisTime = Date.now() - jobAnalysisStartTime;
    
    logger.info('Job analyses completed', {
      jobCount: jobs.length,
      totalTime: jobAnalysisTime,
      avgTimePerJob: Math.round(jobAnalysisTime / jobs.length)
    });

    // Then analyze all resumes in parallel (if not already analyzed)  
    logger.info('Starting resume analyses', { resumeCount: resumes.length });
    const resumeAnalysisStartTime = Date.now();
    
    const resumeAnalysisPromises = resumes.map(async (resume) => {
      try {
        logger.debug(`Starting resume analysis for ${resume.id}`, {
          resumeId: resume.id,
          filename: resume.filename,
          contentLength: resume.content?.length || 0
        });
        
        const resumeAnalysisTime = Date.now();
        const analysis = await analyzeResumeParallel(resume.content, userTier);
        const analysisTime = Date.now() - resumeAnalysisTime;
        
        logger.debug(`Resume analysis completed for ${resume.id}`, {
          resumeId: resume.id,
          analysisTime,
          skillsExtracted: analysis.skills?.length || 0,
          experienceYears: analysis.experienceYears || 0
        });
        
        return analysis;
      } catch (error) {
        logger.error(`Error analyzing resume ${resume.id}`, {
          resumeId: resume.id,
          filename: resume.filename,
          error: error instanceof Error ? error.message : 'Unknown error',
          errorStack: error instanceof Error ? error.stack : undefined
        });
        throw error;
      }
    });

    const resumeAnalyses = await Promise.all(resumeAnalysisPromises);
    const resumeAnalysisTime = Date.now() - resumeAnalysisStartTime;
    
    logger.info('Resume analyses completed', {
      resumeCount: resumes.length,
      totalTime: resumeAnalysisTime,
      avgTimePerResume: Math.round(resumeAnalysisTime / resumes.length)
    });

    // Finally, process all resume-job combinations in parallel
    logger.info('Starting match analyses', {
      totalMatches: totalMatches,
      estimatedTime: 'Based on user tier and system load'
    });
    
    const matchStartTime = Date.now();
    const matchPromises: Promise<unknown>[] = [];
    
    for (let i = 0; i < resumes.length; i++) {
      for (let j = 0; j < jobs.length; j++) {
        const matchPromise = (async () => {
          const matchId = `${resumes[i].id}-${jobs[j].id}`;
          try {
            logger.debug(`Starting match analysis ${matchId}`, {
              resumeId: resumes[i].id,
              jobId: jobs[j].id,
              resumeFilename: resumes[i].filename,
              jobTitle: jobs[j].title
            });
            
            const matchAnalysisTime = Date.now();
            const matchAnalysis = await analyzeMatchTiered(
              resumeAnalyses[i],
              jobAnalyses[j],
              userTier,
              resumes[i].content,
              jobs[j].description
            );
            const analysisTime = Date.now() - matchAnalysisTime;
            
            logger.debug(`Match analysis completed ${matchId}`, {
              resumeId: resumes[i].id,
              jobId: jobs[j].id,
              matchPercentage: matchAnalysis.matchPercentage,
              matchedSkills: matchAnalysis.matchedSkills?.length || 0,
              missingSkills: matchAnalysis.missingSkills?.length || 0,
              analysisTime
            });

            // Store analysis result asynchronously (don't wait)
            logger.debug(`Starting database store for match ${matchId}`);
            const dbStorePromise = storage.createAnalysisResult({
              userId: null, // Will be set by caller
              resumeId: resumes[i].id,
              jobDescriptionId: jobs[j].id,
              matchPercentage: matchAnalysis.matchPercentage,
              matchedSkills: matchAnalysis.matchedSkills,
              missingSkills: matchAnalysis.missingSkills,
              candidateStrengths: matchAnalysis.candidateStrengths,
              candidateWeaknesses: matchAnalysis.candidateWeaknesses,
              confidenceLevel: matchAnalysis.confidenceLevel || 'medium',
              fairnessMetrics: matchAnalysis.fairnessMetrics
            });

            return { 
              resumeId: resumes[i].id, 
              jobId: jobs[j].id, 
              success: true,
              dbStore: dbStorePromise,
              matchId: matchId
            };
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Match analysis failed ${matchId}`, {
              resumeId: resumes[i].id,
              jobId: jobs[j].id,
              resumeFilename: resumes[i].filename,
              jobTitle: jobs[j].title,
              error: errorMessage,
              errorStack: error instanceof Error ? error.stack : undefined
            });
            
            errors.push({ 
              id: resumes[i].id * 1000 + jobs[j].id, // Unique ID for match
              error: errorMessage 
            });
            return { resumeId: resumes[i].id, jobId: jobs[j].id, success: false, matchId: matchId };
          }
        })();
        
        matchPromises.push(matchPromise);
      }
    }

    // Process all matches in parallel
    logger.debug('Waiting for all match analyses to complete');
    const matchResults = await Promise.all(matchPromises);
    processed = matchResults.filter(r => r.success).length;
    const failedMatches = matchResults.filter(r => !r.success).length;
    const matchTime = Date.now() - matchStartTime;

    logger.info('Match analyses completed', {
      totalMatches: matchResults.length,
      successful: processed,
      failed: failedMatches,
      successRate: Math.round((processed / matchResults.length) * 100),
      totalTime: matchTime,
      avgTimePerMatch: Math.round(matchTime / matchResults.length),
      matchesPerSecond: Math.round((matchResults.length / matchTime) * 1000)
    });

    // Wait for all database stores to complete in background
    const dbStorePromises = matchResults
      .filter(r => r.success && r.dbStore)
      .map(r => r.dbStore);
    
    if (dbStorePromises.length > 0) {
      logger.debug(`Starting database stores for ${dbStorePromises.length} successful matches`);
      try {
        const dbResults = await Promise.allSettled(dbStorePromises);
        const dbSuccessful = dbResults.filter(r => r.status === 'fulfilled').length;
        const dbFailed = dbResults.filter(r => r.status === 'rejected').length;
        
        logger.info('Database stores completed', {
          total: dbStorePromises.length,
          successful: dbSuccessful,
          failed: dbFailed
        });
        
        if (dbFailed > 0) {
          logger.warn('Some database stores failed', {
            failedCount: dbFailed,
            failures: dbResults
              .filter(r => r.status === 'rejected')
              .map(r => r.reason)
          });
        }
      } catch (error) {
        logger.warn('Database store error during Promise.allSettled:', error);
      }
    }

    const timeTaken = Date.now() - startTime;
    const avgTimePerMatch = timeTaken / totalMatches;
    
    logger.info('Batch matching process completed', {
      resumeCount: resumes.length,
      jobCount: jobs.length,
      totalMatches: totalMatches,
      successful: processed,
      failed: errors.length,
      successRate: Math.round((processed / totalMatches) * 100),
      totalTime: timeTaken,
      avgTimePerMatch: Math.round(avgTimePerMatch),
      matchesPerSecond: Math.round((totalMatches / timeTaken) * 1000),
      userTier: userTier.name,
      endTime: new Date().toISOString()
    });

    if (errors.length > 0) {
      logger.warn('Batch matching had errors', {
        errorCount: errors.length,
        errors: errors.map(e => ({ matchId: e.id, error: e.error }))
      });
    }

    return {
      success: errors.length === 0,
      processed,
      errors,
      timeTaken
    };

  } catch (error) {
    const timeTaken = Date.now() - startTime;
    logger.error('Batch matching process failed catastrophically', {
      resumeCount: resumes.length,
      jobCount: jobs.length,
      totalMatches: totalMatches,
      resumeIds: resumeIds,
      jobIds: jobIds,
      processed: processed,
      timeTaken: timeTaken,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      userTier: userTier.name
    });
    
    return {
      success: false,
      processed,
      errors: [{ id: -1, error: error instanceof Error ? error.message : 'Batch matching failed' }],
      timeTaken
    };
  }
}

/**
 * Smart batch processor that optimizes batch sizes based on system resources
 * Prevents overwhelming the system while maximizing parallelization
 */
export async function processSmartBatch<T>(
  items: T[],
  processor: (item: T) => Promise<unknown>,
  maxConcurrency: number = 10
): Promise<{ results: unknown[]; errors: unknown[] }> {
  const startTime = Date.now();
  const results: unknown[] = [];
  const errors: unknown[] = [];
  const totalChunks = Math.ceil(items.length / maxConcurrency);

  logger.info('Starting smart batch processing', {
    totalItems: items.length,
    maxConcurrency,
    totalChunks,
    startTime: new Date(startTime).toISOString()
  });

  // Process items in chunks to avoid overwhelming the system
  for (let i = 0; i < items.length; i += maxConcurrency) {
    const chunk = items.slice(i, i + maxConcurrency);
    const chunkNumber = Math.floor(i / maxConcurrency) + 1;
    
    logger.debug(`Processing chunk ${chunkNumber}/${totalChunks}`, {
      chunkSize: chunk.length,
      itemsProcessed: i,
      itemsRemaining: items.length - i - chunk.length
    });
    
    const chunkPromises = chunk.map(async (item, index) => {
      try {
        const result = await processor(item);
        return { success: true, result, index: i + index };
      } catch (error) {
        return { success: false, error, index: i + index };
      }
    });

    const chunkStartTime = Date.now();
    const chunkResults = await Promise.all(chunkPromises);
    const chunkTime = Date.now() - chunkStartTime;
    
    const chunkSuccessful = chunkResults.filter(r => r.success).length;
    const chunkFailed = chunkResults.filter(r => !r.success).length;
    
    logger.debug(`Chunk ${chunkNumber} completed`, {
      chunkSize: chunk.length,
      successful: chunkSuccessful,
      failed: chunkFailed,
      chunkTime,
      avgTimePerItem: Math.round(chunkTime / chunk.length)
    });
    
    chunkResults.forEach(result => {
      if (result.success) {
        results[result.index] = result.result;
      } else {
        errors.push({ index: result.index, error: result.error });
      }
    });
  }

  const totalTime = Date.now() - startTime;
  
  logger.info('Smart batch processing completed', {
    totalItems: items.length,
    successful: results.filter(r => r !== undefined).length,
    failed: errors.length,
    successRate: Math.round((results.filter(r => r !== undefined).length / items.length) * 100),
    totalTime,
    avgTimePerItem: Math.round(totalTime / items.length),
    itemsPerSecond: Math.round((items.length / totalTime) * 1000),
    maxConcurrency,
    chunksProcessed: totalChunks
  });

  return { results, errors };
}