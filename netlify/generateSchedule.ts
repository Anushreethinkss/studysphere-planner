// netlify/functions/generateSchedule.ts
import type { Handler } from "@netlify/functions";
import OpenAI from "openai";

export const handler: Handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");

    const { text, examDate } = body;
    if (!text || !examDate) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing text or examDate" }),
      };
    }

    // 📌 OpenAI client (key is already in Netlify environment)
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    // generate schedule from AI
    const prompt = `
You are a study planner AI. Generate a DAY-BY-DAY timetable based on syllabus text + exam date.

Syllabus:
${text}

Exam Date: ${examDate}

Return JSON ONLY:
{
  "schedule": [
    { "date": "2025-01-01", "topics": ["Chapter 1", "Subtopic A"] },
    ...
  ]
}
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const output = response.output_text || "{}";
    return {
      statusCode: 200,
      body: output,
      headers: { "Content-Type": "application/json" },
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
