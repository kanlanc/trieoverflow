import { http, neo4j } from "@hypermode/modus-sdk-as";
import { dgraph } from "@hypermode/modus-sdk-as";
import { JSON } from "json-as";
import { DiscordMessage, Thread } from "./classes";
import {
  OpenAIChatModel,
  SystemMessage,
  UserMessage,
} from "@hypermode/modus-sdk-as/models/openai/chat";
import { models } from "@hypermode/modus-sdk-as";

const DGRAPH_CONNECTION = "dgraph-grpc";
const modelName = "text-generator";

class AnalysisResult {
  language!: string;
  errorCategory!: string;
  frameworks!: Framework[];
  detectedIssues!: DetectedIssue[];
}

class Framework {
  name!: string;
  version!: string;
  type!: string;
  confidence!: number;
}

class DetectedIssue {
  lineNumber!: number;
  errorMessage!: string;
  confidence!: number;
}

function mapToObject(map: Map<string, string>): Map<string, string> {
  return map;
}

export function convertDiscordMessageToDgraph(
  discordMessage: DiscordMessage,
): Map<string, string> {
  const doc = new Map<string, string>();

  // Create DiscordReference object
  doc.set("dgraph.type", "DiscordReference");
  doc.set(
    "threadId",
    discordMessage.thread !== null ? (discordMessage.thread as Thread).id : "",
  );
  doc.set(
    "threadName",
    discordMessage.thread !== null
      ? (discordMessage.thread as Thread).name
      : "",
  );
  doc.set("channelId", discordMessage.channel_id);
  doc.set("messageId", discordMessage.id);
  doc.set("authorUsername", discordMessage.author.username);
  doc.set(
    "authorGlobalName",
    discordMessage.author.global_name ? discordMessage.author.global_name : "",
  );
  doc.set("content", discordMessage.content);
  doc.set("timestamp", discordMessage.timestamp);
  doc.set(
    "messageCount",
    discordMessage.thread !== null
      ? (discordMessage.thread as Thread).message_count.toString()
      : "0",
  );
  doc.set(
    "memberCount",
    discordMessage.thread !== null
      ? (discordMessage.thread as Thread).member_count.toString()
      : "0",
  );

  return doc;
}

function generateResponse(question: string, context: string): string {
  const model = models.getModel<OpenAIChatModel>(modelName);
  const instruction = `Reply to the user question using only information from the CONTEXT provided. 
      The response starts with a short and concise sentence, followed by a more detailed explanation.
  
      """
      ${context}
      """
      `;

  const input = model.createInput([
    new SystemMessage(instruction),
    new UserMessage(question),
  ]);

  // This is one of many optional parameters available for the OpenAI Chat model.
  input.temperature = 0.5;

  // Here we invoke the model with the input we created.
  const output = model.invoke(input);

  // The output is also specific to the ChatModel interface.
  // Here we return the trimmed content of the first choice.
  return output.choices[0].message.content.trim();
}

export function addQuestionWithDiscordReferenceToDgraph(
  connection: string,
  discordMessage: DiscordMessage,
): Map<string, string> | null {
  const doc = new Map<string, string>();
  // Create Question object

  const questionInput: Map<string, string> = new Map<string, string>();
  questionInput.set("code", "string");
  questionInput.set("sourceEnvironment", "string");

  doc.set("dgraph.type", "Question");
  doc.set("rawCode", discordMessage.content);
  doc.set("language", "UNKNOWN"); // You'll need logic to detect language
  doc.set("errorCategory", "UNKNOWN"); // You'll need logic to categorize error
  doc.set("status", "PENDING");
  doc.set("createdAt", Date.now().toString());
  doc.set("updatedAt", Date.now().toString());
  doc.set("sourceEnvironment", "discord");

  // Create nested DiscordReference
  const discordRef = convertDiscordMessageToDgraph(discordMessage);

  const llmPrompt = `Analyze this code question and provide the following in JSON format:
    1. Programming language (one of: JAVASCRIPT, PYTHON, JAVA, TYPESCRIPT, PHP, RUBY, UNKNOWN)
    2. Error category (one of: SYNTAX_ERROR, RUNTIME_ERROR, COMPILATION_ERROR, LOGICAL_ERROR, DEPENDENCY_ERROR, CONFIGURATION_ERROR, FRAMEWORK_SPECIFIC_ERROR, UNKNOWN)
    3. Frameworks used (array of objects with: name, version, type, confidence)
    4. Detected issues (array of objects with: lineNumber, errorMessage, confidence)

    Question: ${discordMessage.content}`;

  const model = models.getModel<OpenAIChatModel>(modelName);
  const analysis = model.invoke(
    model.createInput([new UserMessage(llmPrompt)]),
  );
  const result = JSON.parse<AnalysisResult>(
    analysis.choices[0].message.content,
  );

  // Update questionJson with analyzed data
  const questionJson: Map<string, string> = new Map<string, string>();
  questionJson.set("dgraph.type", "Question");
  questionJson.set("rawCode", discordMessage.content);
  questionJson.set("language", result.language || "UNKNOWN");
  questionJson.set("errorCategory", result.errorCategory || "UNKNOWN");
  questionJson.set("frameworks", JSON.stringify(result.frameworks || []));
  questionJson.set(
    "detectedIssues",
    JSON.stringify(result.detectedIssues || []),
  );
  questionJson.set("status", "PENDING");
  questionJson.set("createdAt", Date.now().toString());
  questionJson.set("updatedAt", Date.now().toString());
  questionJson.set("sourceEnvironment", "discord");
  // relatedDiscordThreads: [
  //   {
  //     ...mapToObject(discordRef),
  //   },
  // ],

  // Create mutation with nested structure
  const mutations: dgraph.Mutation[] = [
    new dgraph.Mutation(JSON.stringify(questionJson)),
  ];

  const uids = dgraph.execute(
    connection,
    new dgraph.Request(null, mutations),
  ).Uids;

  return uids;
}

export function isCompanyPresent(companyName: string): boolean {
  if (!companyName || companyName.trim().length === 0) {
    return false;
  }

  const vars = new neo4j.Variables();
  vars.set("companyName", companyName);

  const query = `
      MATCH (c:Company {name: $companyName})
      RETURN count(c) > 0 as exists
    `;

  const result = neo4j.executeQuery("neo4j", query, vars);
  if (result.Records.length > 0) {
    return result.Records[0].get("exists") === "true";
  }
  return false;
}

export function semanticSearchURL(url: string, searchQuery: string): string {
  if (
    !url ||
    !searchQuery ||
    url.trim().length === 0 ||
    searchQuery.trim().length === 0
  ) {
    return createEmptySearchResult();
  }

  const queryEmbedding = getStringEmbedding(searchQuery);
  if (queryEmbedding.length === 0) {
    return createEmptySearchResult();
  }

  const embedStr = embeddingToString(queryEmbedding);
  const vars = new neo4j.Variables();
  vars.set("url", url);
  vars.set("embedding", embedStr);

  const cypherQuery = `
      MATCH (u:URL {url: $url})-[:HAS_DOCUMENT]->(d:Document)-[:CONTAINS]->(ch:Chunk)
      WHERE ch.embedding IS NOT NULL
      WITH ch, gds.similarity.cosine(
        ch.embedding,
        [x IN split($embedding, ',') | toFloat(x)]
      ) AS similarity
      ORDER BY similarity DESC
      LIMIT 1
      WITH $url as url, ch.content as content, similarity as score
      RETURN {
        url: url,
        content: content,
        score: toFloat(score)
      } as result
    `;

  const result = neo4j.executeQuery("neo4j", cypherQuery, vars);
  if (result.Records.length > 0) {
    return result.Records[0].get("result");
  }

  return createEmptySearchResult();
}

export function semanticSearchCompany(
  companyName: string,
  searchQuery: string,
): string {
  if (
    !companyName ||
    !searchQuery ||
    companyName.trim().length === 0 ||
    searchQuery.trim().length === 0
  ) {
    return JSON.stringify<SearchResult[]>([]);
  }

  if (!isDatabaseConfigured()) {
    return JSON.stringify<SearchResult[]>([]);
  }

  const queryEmbedding = getStringEmbedding(searchQuery);
  if (queryEmbedding.length === 0) {
    return JSON.stringify<SearchResult[]>([]);
  }

  const embedStr = embeddingToString(queryEmbedding);
  const vars = new neo4j.Variables();
  vars.set("companyName", companyName);
  vars.set("embedding", embedStr);

  const cypherQuery = `
      MATCH (c:Company {name: $companyName})-[:OWNS]->(u:URL)-[:HAS_DOCUMENT]->(d:Document)-[:CONTAINS]->(ch:Chunk)
      WHERE ch.embedding IS NOT NULL
      WITH u, ch, gds.similarity.cosine(
        ch.embedding,
        [x IN split($embedding, ',') | toFloat(x)]
      ) AS similarity
      ORDER BY similarity DESC
      LIMIT 10
      WITH u.url as url, ch.content as content, similarity as score
      RETURN collect({
        url: url,
        content: content,
        score: toFloat(score)
      }) as results
    `;

  const result = neo4j.executeQuery("neo4j", cypherQuery, vars);
  if (result.Records.length > 0) {
    return result.Records[0].get("results");
  }

  return JSON.stringify<SearchResult[]>([]);
}
