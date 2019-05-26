#!/bin/bash
set -e

BUCKET_NAME=YOUR_BUCKET_NAME
# if you want to use route53, make sure to read 
# http://docs.aws.amazon.com/AmazonS3/latest/dev/website-hosting-custom-domain-walkthrough.html
REGION=us-east-1

cat << EOF >  /tmp/website.json
{
    "IndexDocument": {
        "Suffix": "index.html"
    },
    "ErrorDocument": {
        "Key": "error.html"
    }
}
EOF


cat << EOF >  /tmp/bucket_policy.json
{
  "Version":"2012-10-17",
  "Statement":[{
  "Sid":"PublicReadForGetBucketObjects",
        "Effect":"Allow",
    "Principal": "*",
      "Action":["s3:GetObject"],
      "Resource":["arn:aws:s3:::$BUCKET_NAME/*"
      ]
    }
  ]
}
EOF


create_website() {
  aws s3api create-bucket --bucket $BUCKET_NAME --region $REGION
  aws s3api put-bucket-policy --bucket $BUCKET_NAME --policy file:///tmp/bucket_policy.json
  aws s3api put-bucket-website --bucket $BUCKET_NAME --website-configuration file:///tmp/website.json
  aws s3api get-bucket-website --bucket $BUCKET_NAME
}

sync_files() {
aws s3 sync . s3://$BUCKET_NAME --exclude "*.sh" --exclude ".git/*" --exclude "README" --region $REGION
}

# main
create_website
sync_files

echo "Point your browser to the link"
echo http://$BUCKET_NAME.s3-website-$REGION.amazonaws.com