export class SkillProcessor {
  normalizeSkill = jest.fn().mockReturnValue('normalized-skill');
  getSkillEmbedding = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);
  processSkills = jest.fn().mockReturnValue(['skill1', 'skill2']);
}

export const skillProcessor = new SkillProcessor();