#!/usr/bin/env bash

aws sts get-caller-identity
aws sts get-caller-identity --profile ourhardy

# expect to fail
aws s3api get-bucket-location --bucket ourhardy.com
# use key
aws s3api get-bucket-location --bucket ourhardy.com --profile ourhardy

# aws configure --profile ourhardy
aws s3 ls s3://ourhardy.com/ --profile ourhardy

