#!/usr/bin/env bash
# provision タスクを ECS で一回実行し、完了までログを待つ。
# RDS のスキーマ作成、Cognito テストユーザー作成、シード投入を行う。冪等。
set -euo pipefail

: "${AWS_PROFILE:=multi-domain-sandbox}"
export AWS_PROFILE
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/terraform"

CLUSTER=$(terraform output -json ecs | jq -r .cluster)
TASK_DEF=$(terraform output -json ecs | jq -r .provision_task)
SUBNET=$(terraform output -json ecs | jq -r .subnet_id)
SG=$(terraform output -json ecs | jq -r .security_group_id)
LOG_GROUP=$(terraform output -json ecs | jq -r .log_group_provision)

echo "== running $TASK_DEF on $CLUSTER"
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASK_DEF" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SG],assignPublicIp=ENABLED}" \
  --query 'tasks[0].taskArn' --output text)
echo "task: $TASK_ARN"

aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN"
EXIT_CODE=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" \
  --query 'tasks[0].containers[0].exitCode' --output text)
TASK_ID="${TASK_ARN##*/}"

echo "== logs"
aws logs get-log-events --log-group-name "$LOG_GROUP" --log-stream-name "ecs/provision/$TASK_ID" \
  --query 'events[].message' --output text | tr '\t' '\n' || true

echo "== exit code: $EXIT_CODE"
[[ "$EXIT_CODE" == "0" ]]
