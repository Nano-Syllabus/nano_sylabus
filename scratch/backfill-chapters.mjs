import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const unitRules = [
  { unit: "Unit 1 Oscillation", patterns: [/\boscillation\b/g, /\bdamped\b/g, /\bforced\b/g, /\bem oscillation\b/g, /\bshm\b/g, /\bharmonic motion\b/g] },
  { unit: "Unit 2 Wave Motion", patterns: [/\bwave motion\b/g, /\bprogressive wave\b/g, /\bwaves and particles\b/g, /\bstationary wave\b/g, /\bstanding wave\b/g] },
  { unit: "Unit 3 Acoustics", patterns: [/\bacoustics?\b/g, /\breverberation\b/g, /\bsabine\b/g, /\bultrasound\b/g, /\bpitch\b/g, /\bloudness\b/g, /\btimbre\b/g, /\bintensity of sound\b/g] },
  { unit: "Unit 4 Physical Optics", patterns: [/\binterference\b/g, /\bdiffraction\b/g, /\bnewton'?s rings\b/g, /\bpolarization\b/g, /\byoung'?s double slit\b/g, /\bmichelson\b/g] },
  { unit: "Unit 5 Geometrical Optics", patterns: [/\bgeometrical optics\b/g, /\blenses\b/g, /\bcardinal points\b/g, /\bchromatic aberration\b/g, /\bspherical aberration\b/g, /\beye-piece\b/g] },
  { unit: "Unit 6 Laser and Fiber Optics", patterns: [/\blaser\b/g, /\bhe-ne\b/g, /\bfiber optics?\b/g, /\boptical fiber\b/g, /\bspontaneous emission\b/g, /\bstimulated emission\b/g] },
  { unit: "Unit 7 Electrostatics", patterns: [/\belectrostatics?\b/g, /\belectric field\b/g, /\bcapacitor\b/g, /\bdielectric\b/g, /\bgauss'?s law\b/g, /\belectric potential\b/g] },
  { unit: "Unit 8 Electromagnetism", patterns: [/\belectromagnetism\b/g, /\bohm'?s law\b/g, /\bhall effect\b/g, /\bfaraday\b/g, /\bampere\b/g, /\bmagnetic field\b/g, /\bbiot-savart\b/g] },
  { unit: "Unit 9 Electromagnetic Waves", patterns: [/\bmaxwell\b/g, /\bcontinuity equation\b/g, /\belectromagnetic waves?\b/g, /\benergy transfer\b/g, /\bpoynting\b/g] },
  { unit: "Unit 10 Photon and Matter Waves", patterns: [/\bphoton\b/g, /\bmatter waves?\b/g, /\bschrodinger\b/g, /\buncertainty principle\b/g, /\bbarrier tunneling\b/g, /\bde broglie\b/g, /\bphotoelectric\b/g] }
];

async function main() {
  console.log("Fetching Engineering Physics chunks...");
  let allChunks = [];
  let from = 0;
  const size = 200;
  
  while (true) {
    const { data, error } = await supabase
      .from("knowledge_chunks")
      .select("id, content, chapter")
      .eq("subject", "Engineering Physics")
      .range(from, from + size - 1);
      
    if (error) {
      console.error("Error fetching chunks:", error);
      return;
    }
    
    if (data.length === 0) break;
    allChunks.push(...data);
    from += size;
  }
  
  console.log(`Found ${allChunks.length} chunks. Backfilling chapters...`);
  
  let updatedCount = 0;
  let unknownCount = 0;
  
  for (const chunk of allChunks) {
    // If it's already a specific unit, skip
    if (chunk.chapter.startsWith("Unit ")) continue;
    
    const text = chunk.content.toLowerCase();
    let best = null;
    
    for (const rule of unitRules) {
      let score = 0;
      for (const pattern of rule.patterns) {
        const matches = text.match(pattern);
        if (matches) score += matches.length;
      }
      
      if (score > 0 && (!best || score > best.score)) {
        best = { unit: rule.unit, score };
      }
    }
    
    if (best) {
      const { error } = await supabase
        .from("knowledge_chunks")
        .update({ chapter: best.unit })
        .eq("id", chunk.id);
        
      if (error) {
        console.error(`Error updating chunk ${chunk.id}:`, error);
      } else {
        updatedCount++;
        if (updatedCount % 50 === 0) console.log(`Updated ${updatedCount} chunks...`);
      }
    } else {
      unknownCount++;
    }
  }
  
  console.log(`\nBackfill complete!`);
  console.log(`Successfully mapped: ${updatedCount} chunks`);
  console.log(`Could not map (no keywords matched): ${unknownCount} chunks`);
}

main();
