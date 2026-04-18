import test from "node:test";
import assert from "node:assert/strict";
import closedLoopHandler from "../api/closed-loop/[action].ts";

const createMockResponse = () => {
  const state: {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
    ended: boolean;
  } = {
    statusCode: 200,
    body: null,
    headers: {},
    ended: false,
  };

  return {
    state,
    setHeader(name: string, value: string) {
      state.headers[name] = value;
      return this;
    },
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      state.body = payload;
      return this;
    },
    end() {
      state.ended = true;
      return this;
    },
  };
};

const restoreEnvValue = (key: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
};

const withClosedLoopAuthEnv = async (fn: () => Promise<void> | void) => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    token: process.env.CLOSED_LOOP_API_TOKEN,
    requireAuth: process.env.CLOSED_LOOP_REQUIRE_AUTH,
    readRoles: process.env.CLOSED_LOOP_READ_ROLES,
    reviewRoles: process.env.CLOSED_LOOP_REVIEW_ROLES,
    writeRoles: process.env.CLOSED_LOOP_WRITE_ROLES,
  };

  process.env.NODE_ENV = "test";
  process.env.CLOSED_LOOP_API_TOKEN = "closed-loop-secret";
  process.env.CLOSED_LOOP_REQUIRE_AUTH = "1";
  process.env.CLOSED_LOOP_READ_ROLES = "analyst,manager,admin";
  process.env.CLOSED_LOOP_REVIEW_ROLES = "reviewer,operator,admin";
  process.env.CLOSED_LOOP_WRITE_ROLES = "operator,admin";

  try {
    await fn();
  } finally {
    restoreEnvValue("NODE_ENV", previous.nodeEnv);
    restoreEnvValue("CLOSED_LOOP_API_TOKEN", previous.token);
    restoreEnvValue("CLOSED_LOOP_REQUIRE_AUTH", previous.requireAuth);
    restoreEnvValue("CLOSED_LOOP_READ_ROLES", previous.readRoles);
    restoreEnvValue("CLOSED_LOOP_REVIEW_ROLES", previous.reviewRoles);
    restoreEnvValue("CLOSED_LOOP_WRITE_ROLES", previous.writeRoles);
  }
};

test("closed-loop jobs API 缺少 token 会返回 401", async () => {
  await withClosedLoopAuthEnv(async () => {
    const response = createMockResponse();

    await closedLoopHandler(
      {
        method: "GET",
        headers: {},
        query: {
          action: "jobs",
        },
      },
      response,
    );

    assert.equal(response.state.statusCode, 401);
    assert.deepEqual(response.state.body, {
      error: "缺少闭环接口访问令牌。",
    });
  });
});

test("closed-loop jobs API 角色不匹配会返回 403", async () => {
  await withClosedLoopAuthEnv(async () => {
    const response = createMockResponse();

    await closedLoopHandler(
      {
        method: "GET",
        headers: {
          authorization: "Bearer closed-loop-secret",
          "x-user-role": "guest",
        },
        query: {
          action: "jobs",
        },
      },
      response,
    );

    assert.equal(response.state.statusCode, 403);
    assert.deepEqual(response.state.body, {
      error: "当前角色无权访问该闭环接口。",
    });
  });
});

test("closed-loop jobs API 读角色通过后可正常返回", async () => {
  await withClosedLoopAuthEnv(async () => {
    const response = createMockResponse();

    await closedLoopHandler(
      {
        method: "GET",
        headers: {
          authorization: "Bearer closed-loop-secret",
          "x-user-roles": "analyst,manager",
        },
        query: {
          action: "jobs",
        },
      },
      response,
    );

    assert.equal(response.state.statusCode, 200);
    assert.deepEqual(response.state.body, { jobs: [] });
  });
});

test("closed-loop review-decision API 读角色不能写复核结果", async () => {
  await withClosedLoopAuthEnv(async () => {
    const response = createMockResponse();

    await closedLoopHandler(
      {
        method: "POST",
        headers: {
          authorization: "Bearer closed-loop-secret",
          "x-user-role": "analyst",
        },
        body: {},
        query: {
          action: "review-decision",
        },
      },
      response,
    );

    assert.equal(response.state.statusCode, 403);
    assert.deepEqual(response.state.body, {
      error: "当前角色无权访问该闭环接口。",
    });
  });
});

test("closed-loop review-decision API 复核角色通过后仍继续参数校验", async () => {
  await withClosedLoopAuthEnv(async () => {
    const response = createMockResponse();

    await closedLoopHandler(
      {
        method: "POST",
        headers: {
          authorization: "Bearer closed-loop-secret",
          "x-user-role": "reviewer",
        },
        body: {},
        query: {
          action: "review-decision",
        },
      },
      response,
    );

    assert.equal(response.state.statusCode, 400);
    assert.deepEqual(response.state.body, {
      error: "缺少复核参数。",
    });
  });
});

test("closed-loop import API 只允许写角色访问", async () => {
  await withClosedLoopAuthEnv(async () => {
    const deniedResponse = createMockResponse();

    await closedLoopHandler(
      {
        method: "POST",
        headers: {
          authorization: "Bearer closed-loop-secret",
          "x-user-role": "reviewer",
        },
        body: {},
        query: {
          action: "import",
        },
      },
      deniedResponse,
    );

    assert.equal(deniedResponse.state.statusCode, 403);
    assert.deepEqual(deniedResponse.state.body, {
      error: "当前角色无权访问该闭环接口。",
    });

    const allowedResponse = createMockResponse();
    await closedLoopHandler(
      {
        method: "POST",
        headers: {
          authorization: "Bearer closed-loop-secret",
          "x-user-role": "operator",
        },
        body: {},
        query: {
          action: "import",
        },
      },
      allowedResponse,
    );

    assert.equal(allowedResponse.state.statusCode, 400);
    assert.deepEqual(allowedResponse.state.body, {
      error: "缺少闭环底座文件。",
    });
  });
});
