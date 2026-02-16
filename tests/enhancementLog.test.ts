/**
 * Tests for EnhancementLogManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PklTranscript } from '../src/transcript.js';
import { unlinkSync, existsSync } from 'node:fs';
import type { EntityReference } from '../src/types.js';

describe('EnhancementLogManager', () => {
  const testFile = './test-enhancement-log.pkl';

  beforeEach(() => {
    // Clean up test file if it exists
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  });

  afterEach(() => {
    // Clean up test file
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  });

  it('should log a single enhancement step', () => {
    const transcript = PklTranscript.create(testFile, {
      id: 'test-id',
      title: 'Test Transcript',
    });

    const timestamp = new Date('2026-02-15T20:00:00Z');
    transcript.enhancementLog.logStep(
      timestamp,
      'transcribe',
      'entity_found',
      { entityName: 'John Doe', confidence: 0.95 },
      [{ id: 'john-doe', name: 'John Doe', type: 'person' }]
    );

    const log = transcript.getEnhancementLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      phase: 'transcribe',
      action: 'entity_found',
      details: { entityName: 'John Doe', confidence: 0.95 },
      entities: [{ id: 'john-doe', name: 'John Doe', type: 'person' }],
    });
    expect(log[0].timestamp.toISOString()).toBe(timestamp.toISOString());

    transcript.close();
  });

  it('should log multiple steps in batch', () => {
    const transcript = PklTranscript.create(testFile, {
      id: 'test-id',
      title: 'Test Transcript',
    });

    const steps = [
      {
        timestamp: new Date('2026-02-15T20:00:00Z'),
        phase: 'transcribe' as const,
        action: 'entity_found',
        details: { entityName: 'John Doe' },
      },
      {
        timestamp: new Date('2026-02-15T20:01:00Z'),
        phase: 'enhance' as const,
        action: 'tool_called',
        details: { tool: 'gpt-4', prompt: 'Enhance transcript' },
      },
      {
        timestamp: new Date('2026-02-15T20:02:00Z'),
        phase: 'simple-replace' as const,
        action: 'correction_applied',
        details: { from: 'Protocol', to: 'Protokoll' },
      },
    ];

    transcript.enhancementLog.logSteps(steps);

    const log = transcript.getEnhancementLog();
    expect(log).toHaveLength(3);
    expect(log[0].action).toBe('entity_found');
    expect(log[1].action).toBe('tool_called');
    expect(log[2].action).toBe('correction_applied');

    transcript.close();
  });

  it('should filter log by phase', () => {
    const transcript = PklTranscript.create(testFile, {
      id: 'test-id',
      title: 'Test Transcript',
    });

    transcript.enhancementLog.logStep(new Date(), 'transcribe', 'entity_found');
    transcript.enhancementLog.logStep(new Date(), 'enhance', 'tool_called');
    transcript.enhancementLog.logStep(new Date(), 'simple-replace', 'correction_applied');

    const transcribeLog = transcript.enhancementLog.getLogByPhase('transcribe');
    expect(transcribeLog).toHaveLength(1);
    expect(transcribeLog[0].phase).toBe('transcribe');

    const enhanceLog = transcript.enhancementLog.getLogByPhase('enhance');
    expect(enhanceLog).toHaveLength(1);
    expect(enhanceLog[0].phase).toBe('enhance');

    transcript.close();
  });

  it('should filter log by action', () => {
    const transcript = PklTranscript.create(testFile, {
      id: 'test-id',
      title: 'Test Transcript',
    });

    transcript.enhancementLog.logStep(new Date(), 'transcribe', 'entity_found');
    transcript.enhancementLog.logStep(new Date(), 'enhance', 'entity_found');
    transcript.enhancementLog.logStep(new Date(), 'enhance', 'tool_called');

    const entityFoundLog = transcript.getEnhancementLog({ action: 'entity_found' });
    expect(entityFoundLog).toHaveLength(2);
    expect(entityFoundLog.every(e => e.action === 'entity_found')).toBe(true);

    transcript.close();
  });

  it('should filter log by phase and action', () => {
    const transcript = PklTranscript.create(testFile, {
      id: 'test-id',
      title: 'Test Transcript',
    });

    transcript.enhancementLog.logStep(new Date(), 'transcribe', 'entity_found');
    transcript.enhancementLog.logStep(new Date(), 'enhance', 'entity_found');
    transcript.enhancementLog.logStep(new Date(), 'enhance', 'tool_called');

    const enhanceEntityLog = transcript.getEnhancementLog({ 
      phase: 'enhance',
      action: 'entity_found'
    });
    expect(enhanceEntityLog).toHaveLength(1);
    expect(enhanceEntityLog[0].phase).toBe('enhance');
    expect(enhanceEntityLog[0].action).toBe('entity_found');

    transcript.close();
  });

  it('should return log entries in chronological order', () => {
    const transcript = PklTranscript.create(testFile, {
      id: 'test-id',
      title: 'Test Transcript',
    });

    const time1 = new Date('2026-02-15T20:00:00Z');
    const time2 = new Date('2026-02-15T20:01:00Z');
    const time3 = new Date('2026-02-15T20:02:00Z');

    transcript.enhancementLog.logStep(time2, 'enhance', 'step2');
    transcript.enhancementLog.logStep(time1, 'transcribe', 'step1');
    transcript.enhancementLog.logStep(time3, 'simple-replace', 'step3');

    const log = transcript.getEnhancementLog();
    expect(log).toHaveLength(3);
    expect(log[0].action).toBe('step1');
    expect(log[1].action).toBe('step2');
    expect(log[2].action).toBe('step3');

    transcript.close();
  });

  it('should get log count', () => {
    const transcript = PklTranscript.create(testFile, {
      id: 'test-id',
      title: 'Test Transcript',
    });

    expect(transcript.getEnhancementLogCount()).toBe(0);

    transcript.enhancementLog.logStep(new Date(), 'transcribe', 'step1');
    transcript.enhancementLog.logStep(new Date(), 'enhance', 'step2');

    expect(transcript.getEnhancementLogCount()).toBe(2);

    transcript.close();
  });

  it('should clear all log entries', () => {
    const transcript = PklTranscript.create(testFile, {
      id: 'test-id',
      title: 'Test Transcript',
    });

    transcript.enhancementLog.logStep(new Date(), 'transcribe', 'step1');
    transcript.enhancementLog.logStep(new Date(), 'enhance', 'step2');

    expect(transcript.getEnhancementLogCount()).toBe(2);

    transcript.enhancementLog.clearLog();

    expect(transcript.getEnhancementLogCount()).toBe(0);
    expect(transcript.getEnhancementLog()).toHaveLength(0);

    transcript.close();
  });

  it('should handle steps without details or entities', () => {
    const transcript = PklTranscript.create(testFile, {
      id: 'test-id',
      title: 'Test Transcript',
    });

    transcript.enhancementLog.logStep(new Date(), 'transcribe', 'started');

    const log = transcript.getEnhancementLog();
    expect(log).toHaveLength(1);
    expect(log[0].details).toBeUndefined();
    expect(log[0].entities).toBeUndefined();

    transcript.close();
  });

  it('should persist log entries across open/close', () => {
    // Create and add entries
    let transcript = PklTranscript.create(testFile, {
      id: 'test-id',
      title: 'Test Transcript',
    });

    transcript.enhancementLog.logStep(new Date(), 'transcribe', 'entity_found');
    transcript.enhancementLog.logStep(new Date(), 'enhance', 'tool_called');
    transcript.close();

    // Reopen and verify
    transcript = PklTranscript.open(testFile);
    const log = transcript.getEnhancementLog();
    expect(log).toHaveLength(2);
    expect(log[0].action).toBe('entity_found');
    expect(log[1].action).toBe('tool_called');

    transcript.close();
  });

  it('should handle entity references correctly', () => {
    const transcript = PklTranscript.create(testFile, {
      id: 'test-id',
      title: 'Test Transcript',
    });

    const entities: EntityReference[] = [
      { id: 'john-doe', name: 'John Doe', type: 'person' },
      { id: 'acme-corp', name: 'Acme Corp', type: 'company' },
    ];

    transcript.enhancementLog.logStep(
      new Date(),
      'transcribe',
      'entities_found',
      { count: 2 },
      entities
    );

    const log = transcript.getEnhancementLog();
    expect(log[0].entities).toHaveLength(2);
    expect(log[0].entities?.[0]).toMatchObject({
      id: 'john-doe',
      name: 'John Doe',
      type: 'person',
    });

    transcript.close();
  });
});
