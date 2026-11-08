#!/usr/bin/env bash
# Run by the deploy workflow to apply deploy/aws/stack.yaml to the app's stack. Every
# parameter keeps its current value, and the change set is refused if it would replace or
# remove a resource. CloudFormation makes the change as the narrow role from github-deploy.yaml.
#   update-stack.sh <stack name> <change set name>
set -euo pipefail

stack="${1:?Usage: update-stack.sh <stack name> <change set name>}"
change_set="${2:?Usage: update-stack.sh <stack name> <change set name>}"
account="$(aws sts get-caller-identity --query Account --output text)"
stack_role="arn:aws:iam::$account:role/$stack-cloudformation"

mapfile -t parameters < <(aws cloudformation describe-stacks --stack-name "$stack" \
  --query 'Stacks[0].Parameters[].ParameterKey' --output text | tr '\t' '\n')
previous=()
for key in "${parameters[@]}"; do
  previous+=("ParameterKey=$key,UsePreviousValue=true")
done

aws cloudformation create-change-set \
  --stack-name "$stack" \
  --change-set-name "$change_set" \
  --template-body file://deploy/aws/stack.yaml \
  --parameters "${previous[@]}" \
  --capabilities CAPABILITY_IAM \
  --role-arn "$stack_role" > /dev/null

if ! aws cloudformation wait change-set-create-complete --stack-name "$stack" --change-set-name "$change_set"; then
  reason="$(aws cloudformation describe-change-set --stack-name "$stack" --change-set-name "$change_set" \
    --query StatusReason --output text)"
  aws cloudformation delete-change-set --stack-name "$stack" --change-set-name "$change_set"
  if [[ "$reason" == *"didn't contain changes"* || "$reason" == *"No updates are to be performed"* ]]; then
    echo "The stack is already up to date."
    exit 0
  fi
  echo "::error title=Change set failed::$reason"
  exit 1
fi

aws cloudformation describe-change-set --stack-name "$stack" --change-set-name "$change_set" \
  --output json > change-set.json
aws cloudformation describe-change-set --stack-name "$stack" --change-set-name "$change_set" \
  --query 'Changes[].ResourceChange.[Action,LogicalResourceId,ResourceType,Replacement]' --output table
if ! npx tsx tools/deploy-checks.ts change-set change-set.json; then
  aws cloudformation delete-change-set --stack-name "$stack" --change-set-name "$change_set"
  exit 1
fi

aws cloudformation execute-change-set --stack-name "$stack" --change-set-name "$change_set"
aws cloudformation wait stack-update-complete --stack-name "$stack"
echo "The stack is updated."
