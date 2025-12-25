import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as pdfjs from "https://esm.sh/pdfjs-dist@4.0.379/build/pdf.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    
    let fileData: Uint8Array;
    let fileName = "file.pdf";
    let fileType = "application/pdf";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      
      if (!file) {
        return new Response(
          JSON.stringify({ error: "No file provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      fileName = file.name;
      fileType = file.type;
      fileData = new Uint8Array(await file.arrayBuffer());
    } else {
      const body = await req.json();
      if (!body.fileData) {
        return new Response(
          JSON.stringify({ error: "No file data provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      fileName = body.fileName || "file.pdf";
      fileType = body.fileType || "application/pdf";
      
      const base64Data = body.fileData.split(",").pop() || body.fileData;
      fileData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    }

    console.log(`Processing file: ${fileName}, type: ${fileType}, size: ${fileData.length} bytes`);

    // Handle text files directly
    if (fileType === "text/plain" || fileName.endsWith(".txt")) {
      const text = new TextDecoder().decode(fileData);
      console.log(`Text file extracted: ${text.length} characters`);
      return new Response(
        JSON.stringify({ extractedText: text, fileName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For PDFs, use pdf.js
    if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
      try {
        // Load PDF document
        const loadingTask = pdfjs.getDocument({ data: fileData });
        const pdf = await loadingTask.promise;
        
        console.log(`PDF loaded: ${pdf.numPages} pages`);
        
        const textParts: string[] = [];
        
        // Extract text from each page (limit to first 20 pages for performance)
        const maxPages = Math.min(pdf.numPages, 20);
        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(" ");
          
          if (pageText.trim()) {
            textParts.push(pageText);
          }
        }
        
        let extractedText = textParts.join("\n\n");
        
        // Clean up the text
        extractedText = extractedText
          .replace(/\s+/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/Chapter/gi, '\nChapter')
          .replace(/Unit/gi, '\nUnit')
          .trim();
        
        // Split into lines and clean
        const lines = extractedText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
        
        extractedText = lines.join('\n');
        
        if (!extractedText || extractedText.length < 10) {
          console.log("PDF extraction returned minimal text, may be image-based");
          return new Response(
            JSON.stringify({ 
              error: "PDF could not be parsed. This may be a scanned/image-based PDF. Please copy and paste the text manually.",
              extractedText: ""
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`PDF extracted: ${extractedText.length} characters`);
        return new Response(
          JSON.stringify({ extractedText, fileName }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
        
      } catch (pdfError) {
        console.error("PDF.js parsing error:", pdfError);
        return new Response(
          JSON.stringify({ 
            error: "PDF could not be parsed. Try a different file or paste text manually.",
            extractedText: ""
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Unsupported file type. Please upload a PDF or TXT file." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error parsing file:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to parse file",
        extractedText: ""
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
