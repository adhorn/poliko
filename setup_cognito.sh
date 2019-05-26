#!/bin/bash
set -e

COGNITO_ID_NAME=poliko
EXEC_ROLE_NAME_UNAUTH=poliko_unauth
EXEC_ROLE_NAME_AUTH=poliko_auth
ACCOUNT_NUMBER=$(aws ec2 describe-security-groups --group-names 'Default' --query 'SecurityGroups[0].OwnerId' --output text)
REGION=us-east-1

cat << EOF >  /tmp/trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Federated": "cognito-identity.amazonaws.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity"
    }
  ]
}
EOF

cat << EOF >  /tmp/unauth_poliko.json
{
  "Version": "2012-10-17",
  "Statement": [{
      "Effect": "Allow",
      "Action": [
          "rekognition:DetectLabels",
          "rekognition:DetectFaces",
          "polly:SynthesizeSpeech"
      ],
      "Resource": [ "*" ]
  }]
}
EOF


cat << EOF >  /tmp/auth_poliko.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "mobileanalytics:PutEvents",
        "cognito-sync:*",
        "cognito-identity:*"
      ],
      "Resource": [
        "*"
      ]
    }
  ]
}

EOF


create_execution_role() {
  ROLE_ARN_AUTH=$(aws iam create-role --role-name $EXEC_ROLE_NAME_AUTH --assume-role-policy-document file:///tmp/trust-policy.json --query Role.Arn  --output text)
  ROLE_ARN_UNAUTH=$(aws iam create-role --role-name $EXEC_ROLE_NAME_UNAUTH --assume-role-policy-document file:///tmp/trust-policy.json --query Role.Arn  --output text)
  aws iam put-role-policy --role-name $EXEC_ROLE_NAME_AUTH --policy-name save-mePolicy --policy-document file:///tmp/auth_poliko.json
  aws iam put-role-policy --role-name $EXEC_ROLE_NAME_UNAUTH --policy-name save-mePolicy --policy-document file:///tmp/unauth_poliko.json
  echo $ROLE_ARN_AUTH
  echo $ROLE_ARN_UNAUTH
}


create_cognito_id() {
IDENTITY_POOL_ID=$(aws cognito-identity create-identity-pool --identity-pool-name $COGNITO_ID_NAME --allow-unauthenticated-identities --region $REGION --query IdentityPoolId  --output text)
POOL_ARN=arn:aws:cognito-identity:$REGION:$ACCOUNT_NUMBER:identitypool/$IDENTITY_POOL_ID
echo $IDENTITY_POOL_ID
echo $POOL_ARN
echo $EXEC_ROLE_NAME_AUTH
echo $EXEC_ROLE_NAME_UNAUTH
TT=$(aws cognito-identity set-identity-pool-roles --region $REGION --identity-pool-id $IDENTITY_POOL_ID --roles authenticated=$ROLE_ARN_AUTH,unauthenticated=$ROLE_ARN_UNAUTH)
echo $TT
}


update_configuration() {
  sed -i.bak s/REPLACE_ME/$IDENTITY_POOL_ID/g ai.js
}

# main
create_execution_role
create_cognito_id
update_configuration

