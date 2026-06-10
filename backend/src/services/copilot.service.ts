import prisma from '../prisma';
import { config } from '../config';

interface CopilotAnalysis {
  suggestions: string[];
  bugs: string[];
  features: string[];
  pitchTips: string[];
  readinessScore: number; // 0 to 100
}

export class CopilotService {
  static async analyzeTeam(teamId: string): Promise<CopilotAnalysis> {
    // 1. Gather all team information
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        tasks: true,
        messages: {
          take: 20,
          orderBy: { timestamp: 'desc' },
          include: { user: true }
        },
        snippets: {
          take: 5,
          orderBy: { createdAt: 'desc' }
        },
        documents: true
      }
    });

    if (!team) {
      throw new Error('Team not found');
    }

    // Prepare context payload for the model
    const tasksSummary = team.tasks.map(t => `- [${t.column.toUpperCase()}] ${t.title}: ${t.description}`).join('\n');
    const chatSummary = team.messages
      .reverse()
      .map(m => `[${m.user?.name || 'System'}]: ${m.text}`)
      .join('\n');
    const codeSummary = team.snippets.map(s => `// Snippet: ${s.title} (${s.language})\n${s.code.substring(0, 500)}`).join('\n---\n');
    const docsSummary = team.documents.map(d => `# ${d.title}\n${d.content.substring(0, 500)}`).join('\n---\n');

    const promptText = `
You are the Hackathon Copilot - an elite AI Hackathon Coach.
Analyze the following team state for the hackathon project "${team.name}":

--- KANBAN TASKS ---
${tasksSummary || 'No tasks defined yet.'}

--- RECENT CHAT LOGS ---
${chatSummary || 'No chat messages yet.'}

--- CODE SNIPPETS ---
${codeSummary || 'No code snippets added yet.'}

--- PROJECT DOCUMENTS ---
${docsSummary || 'No project documents created yet.'}

Based on this information, provide:
1. "suggestions": 3-4 highly actionable next steps for the team to focus on.
2. "bugs": 2-3 potential bugs, logic flaws, or security vulnerabilities based on their code, chat, or tasks.
3. "features": 2-3 killer feature ideas or integrations that would make this hackathon project stand out.
4. "pitchTips": 2-3 specific suggestions to improve their final demo pitch and presentation slide alignment.
5. "readinessScore": An integer from 0 to 100 indicating how close the project is to being ready for submission (based on task completion, document status, and code maturity).

You MUST respond strictly in the following JSON format:
{
  "suggestions": ["suggestion 1", "suggestion 2", ...],
  "bugs": ["bug 1", "bug 2", ...],
  "features": ["feature 1", "feature 2", ...],
  "pitchTips": ["pitch tip 1", "pitch tip 2", ...],
  "readinessScore": 75
}
`;

    // 2. Call Hugging Face API if key is available
    if (config.huggingfaceApiKey) {
      try {
        const response = await fetch(
          'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-Coder-32B-Instruct/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.huggingfaceApiKey}`
            },
            body: JSON.stringify({
              model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
              messages: [
                {
                  role: 'user',
                  content: promptText
                }
              ],
              max_tokens: 2048,
              temperature: 0.2
            }),
          }
        );

        if (response.ok) {
          const resData = (await response.json()) as any;
          let responseText = resData.choices?.[0]?.message?.content;
          if (responseText) {
            responseText = responseText.trim();
            // Clean up Markdown code block wrapping if present
            if (responseText.startsWith('```json')) {
              responseText = responseText.substring(7);
            } else if (responseText.startsWith('```')) {
              responseText = responseText.substring(3);
            }
            if (responseText.endsWith('```')) {
              responseText = responseText.substring(0, responseText.length - 3);
            }
            responseText = responseText.trim();

            const parsed = JSON.parse(responseText) as CopilotAnalysis;
            if (parsed && typeof parsed === 'object') {
              parsed.suggestions = parsed.suggestions || [];
              parsed.bugs = parsed.bugs || [];
              parsed.features = parsed.features || [];
              parsed.pitchTips = parsed.pitchTips || [];
              parsed.readinessScore = typeof parsed.readinessScore === 'number' ? parsed.readinessScore : 50;

              // Save state in the database
              await prisma.team.update({
                where: { id: teamId },
                data: { copilotState: JSON.stringify(parsed) }
              });
              return parsed;
            }
          }
        } else {
          const errBody = await response.text().catch(() => '');
          console.error('[Copilot Service] Hugging Face API returned error status:', response.status, errBody);
        }
      } catch (err) {
        // Silent fallback to mock analysis when offline or Hugging Face is unavailable
      }
    }

    // 3. Fallback: Smart, dynamic mock analysis if Gemini API is not configured or fails
    const mockAnalysis = this.generateMockAnalysis(team);
    
    // Save state in the database
    await prisma.team.update({
      where: { id: teamId },
      data: { copilotState: JSON.stringify(mockAnalysis) }
    });

    return mockAnalysis;
  }

  private static generateMockAnalysis(team: any): CopilotAnalysis {
    const tasks = team.tasks || [];
    const messages = team.messages || [];
    const snippets = team.snippets || [];
    const documents = team.documents || [];

    const todoCount = tasks.filter((t: any) => t.column === 'todo').length;
    const progressCount = tasks.filter((t: any) => t.column === 'inprogress').length;
    const doneCount = tasks.filter((t: any) => t.column === 'done').length;
    const totalTasks = tasks.length;

    // Calculate dynamic readiness score
    let score = 15; // Base score
    if (totalTasks > 0) {
      score += Math.round((doneCount / totalTasks) * 45);
      score += Math.round((progressCount / totalTasks) * 15);
    }
    if (snippets.length > 0) score += 10;
    if (documents.length > 0) score += 10;
    if (messages.length > 5) score += 5;
    score = Math.min(score, 100);

    // Dynamic suggestions based on data
    const suggestions: string[] = [];
    const bugs: string[] = [];
    const features: string[] = [];
    const pitchTips: string[] = [];

    // Analyze snippets for actual issues
    let codeIssuesCount = 0;
    snippets.forEach((snip: any) => {
      const code = snip.code || '';
      if (code.includes('threw')) {
        bugs.push(`Critical Typo in '${snip.title}': Unexpected keyword 'threw' used instead of 'throw'. Correcting this resolves runtime execution crash.`);
        codeIssuesCount++;
      }
      if (code.match(/(key|secret|password|token)\s*=\s*['"][a-zA-Z0-9_\-]{8,}['"]/i)) {
        bugs.push(`Security Risk in '${snip.title}': Hardcoded credential key or token string detected. Ensure variables are loaded via process.env.`);
        codeIssuesCount++;
      }
      if (code.includes('CORS') && code.includes('*')) {
        bugs.push(`Configuration Warning in '${snip.title}': Wildcard CORS origin ('*') enabled. Refine config to prevent unauthorized client calls.`);
        codeIssuesCount++;
      }
      if (code.includes('processBatch') && !code.includes('try') && !code.includes('.catch')) {
        bugs.push(`Logic Warning in '${snip.title}': Unhandled promise risk. asynchronous 'processBatch' is called without proper error wrapping.`);
        codeIssuesCount++;
      }
    });

    // Fallback bugs if none found in code
    if (bugs.length === 0) {
      if (snippets.length === 0) {
        bugs.push("No shared code snippets detected in live editor. Begin drafting to activate code safety scanners.");
      } else {
        bugs.push("General Warning: Ensure CORS settings in Express router match actual development client port 3000.");
      }
      bugs.push("Vault Asset warning: No demonstration video link or slideshow asset attached yet in final deliverables.");
    }

    // Suggestions logic
    if (totalTasks === 0) {
      suggestions.push("Create your first task cards in the Kanban board to structure the development sprint.");
    }
    if (todoCount > doneCount) {
      suggestions.push("Assign and move high-priority tasks to 'In Progress' to coordinate teammate efforts.");
    }
    if (snippets.length === 0) {
      suggestions.push("Begin drafting code in the Live Code Editor. Add the initial Express router or Prisma config.");
    } else {
      if (codeIssuesCount > 0) {
        suggestions.push("Review active code bugs. Run AI autofix inside the editor console to resolve compiling warnings.");
      }
      suggestions.push("Run tests on your shared code snippets to ensure API routes return expected payloads.");
    }
    if (documents.length === 0) {
      suggestions.push("Create a project README document to outline the problem statement and technical architecture.");
    } else {
      suggestions.push("Polish your team pitch slide outline inside the documents directory.");
    }
    if (suggestions.length < 3) {
      suggestions.push("Verify that the WebSocket gateway links all members without latency issues.");
    }

    // Features logic
    if (snippets.some((s: any) => s.code.includes('prisma'))) {
      features.push("Integrate Prisma seeds to populate active teams, badges, and user scores automatically on startup.");
    }
    features.push("Implement a telemetry endpoint showing actual request latencies during the judges' demo.");
    features.push("Add a landing-page simulator tool to let judges interact with mock client instances live.");

    // Pitch validation logic
    pitchTips.push("Introduce the problem statement in the first 30 seconds of the presentation.");
    pitchTips.push("Avoid showing raw login flows during the demo video. Start directly from the collaborative workspace.");
    pitchTips.push("Quantify impact: state how HackHub increases speed-to-submission by minimizing application switching.");

    return {
      suggestions: suggestions.slice(0, 4),
      bugs: bugs.slice(0, 3),
      features: features.slice(0, 3),
      pitchTips: pitchTips.slice(0, 3),
      readinessScore: score
    };
  }
}
