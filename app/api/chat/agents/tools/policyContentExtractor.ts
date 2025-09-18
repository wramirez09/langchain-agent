{ { ... } }
      } catch (parseError) {
    console.error("[PolicyContentExtractor] Error parsing LLM response:", parseError);
    console.error("Raw LLM response:", rawText);
    const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
    throw new Error(`Failed to parse policy data: ${errorMessage}`);
}
    } catch (error) {
    console.error("[PolicyContentExtractor] Error in _call:", error);
    throw error; // Re-throw to be handled by the agent
}
{ { ... } }
