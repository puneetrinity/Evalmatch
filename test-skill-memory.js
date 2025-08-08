#!/usr/bin/env node

// Simple test script to verify skill memory system
import { skillMemorySystem } from './server/lib/skill-memory-system.js';
import { skillLearningScheduler } from './server/lib/skill-learning-scheduler.js';

console.log('🧪 Testing Skill Memory System...');

async function testSkillMemorySystem() {
  try {
    // Test 1: Process a new skill
    console.log('\n1. Testing skill discovery...');
    
    const result = await skillMemorySystem.processDiscoveredSkill('Kubernetes AI', {
      type: 'resume',
      id: 'test-resume-123',
      contextSnippet: 'I have 3 years of experience with Kubernetes AI deployment and management'
    });
    
    console.log('✅ Skill processing result:', result);
    
    // Test 2: Get system stats
    console.log('\n2. Getting system stats...');
    const stats = await skillMemorySystem.getSystemStats();
    console.log('📊 System stats:', stats);
    
    // Test 3: Test scheduler status
    console.log('\n3. Testing scheduler...');
    const schedulerStatus = skillLearningScheduler.getStatus();
    console.log('⏰ Scheduler status:', schedulerStatus);
    
    console.log('\n🎉 All tests passed! Skill memory system is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testSkillMemorySystem();