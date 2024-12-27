# inadyn-route53

A simple app that creates a lambda that accepts [inadyn](https://github.com/troglobit/inadyn)
requests and updates a subdomain in a route53 hosted zone.

## Usage

Anything that uses inadyn can work with a config like:
```
iface = eth8.201

custom endpoint.lambda-url.us-east-1.on.aws:1 {
    hostname = "host-in-subdomain"
    username = "ignored"
    password = "random-password"
    ddns-server = "endpoint.lambda-url.us-east-1.on.aws"
    ddns-path = "/?subdomain=%h&newVal=%i&password=%p&okRespBody=Updated"
}
```

In the UPM Pro's UI:

```
Service: custom
Hostname: host-in-subdomain
Username: ignored
Password: random-password
Server: endpoint.lambda-url.us-east-1.on.aws/?subdomain=%h&newVal=%i&password=%p&okRespBody=Updated
```

## Deploying

You can set the hashed password value when deploying with an env variable:
```
$ export SHA256_HASHED_PASSWD="$(echo -n 'random-password' | sha256sum | cut -f 1 -d ' ')" 
```

This value is saved in an SSM parameter.  You can also just set the value in the AWS UI
after it's deployed.  The value is the sha256 sum of the password.

### New or Existing HostedZone

If you have an existing route53 HostedZone that you want to keep, set its ID in the context:

```
$ cdk deploy --context existingHostedZoneId=XYZYOURHOSTEDZONEID
```

Otherwise, you can create a new one; just pass in the name you want to use:
```
$ cdk deploy --parameters hostedZoneDomain=example.com
```

# Development

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
