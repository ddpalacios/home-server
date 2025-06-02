/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.6.22-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: localhost    Database: Users
-- ------------------------------------------------------
-- Server version	10.6.22-MariaDB-0ubuntu0.22.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `Audio`
--

DROP TABLE IF EXISTS `Audio`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `Audio` (
  `Id` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `starttime` varchar(255) DEFAULT NULL,
  `endtime` varchar(255) DEFAULT NULL,
  `duration` decimal(6,2) DEFAULT NULL,
  `userid` varchar(255) DEFAULT NULL,
  `path` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Audio`
--

LOCK TABLES `Audio` WRITE;
/*!40000 ALTER TABLE `Audio` DISABLE KEYS */;
INSERT INTO `Audio` VALUES ('mbcvtnrg48mnu2t58','Audio_mbcvtnrg48mnu2t58','2025-05-31T23:47:41.836Z','2025-05-31T23:47:51.865Z',0.17,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbcvtnrg48mnu2t58.webm'),('mbcw04f487n63pqiz','Audio_mbcw04f487n63pqiz','2025-05-31T23:52:43.360Z','2025-05-31T23:52:49.408Z',0.10,'9b1c240de14f19ca3e44da49e9932ed2','users/9b1c240de14f19ca3e44da49e9932ed2/recordings/Audio_mbcw04f487n63pqiz.webm'),('mbcwym2ood7d1ujxw','Audio_mbcwym2ood7d1ujxw','2025-06-01T00:19:32.544Z','2025-06-01T00:19:52.303Z',0.32,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbcwym2ood7d1ujxw.webm'),('mbd2euwjw2zte14eh','Audio_mbd2euwjw2zte14eh','2025-06-01T02:52:08.563Z','2025-06-01T02:53:00.498Z',0.85,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbd2euwjw2zte14eh.webm'),('mbe0226m81p0b5pmv','Audio_mbe0226m81p0b5pmv','2025-06-01T18:33:58.414Z','2025-06-01T18:34:02.520Z',0.07,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe0226m81p0b5pmv.webm'),('mbe02zqs2esi0up79','Audio_mbe02zqs2esi0up79','2025-06-01T18:34:41.908Z','2025-06-01T18:34:48.113Z',0.10,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe02zqs2esi0up79.webm'),('mbe06wn4q1xgig8m8','Audio_mbe06wn4q1xgig8m8','2025-06-01T18:37:44.512Z','2025-06-01T18:37:48.448Z',0.05,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe06wn4q1xgig8m8.webm'),('mbe075royxegrl3dr','Audio_mbe075royxegrl3dr','2025-06-01T18:37:56.340Z','2025-06-01T18:38:04.511Z',0.13,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe075royxegrl3dr.webm'),('mbe07vzfsq3d2o5b0','Audio_mbe07vzfsq3d2o5b0','2025-06-01T18:38:30.315Z','2025-06-01T18:39:23.096Z',0.87,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe07vzfsq3d2o5b0.webm'),('mbe099uapeknk48f8','Audio_mbe099uapeknk48f8','2025-06-01T18:39:34.930Z','2025-06-01T18:40:54.112Z',1.32,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe099uapeknk48f8.webm'),('mbe33qniuj5u1ww30','Audio_mbe33qniuj5u1ww30','2025-06-01T19:59:15.630Z','2025-06-01T19:59:19.463Z',0.05,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe33qniuj5u1ww30.webm'),('mbe3asr6a7s4xd2yy','Audio_mbe3asr6a7s4xd2yy','2025-06-01T20:04:44.946Z','2025-06-01T20:04:52.640Z',0.12,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3asr6a7s4xd2yy.webm'),('mbe3b4pnju6mmjaid','Audio_mbe3b4pnju6mmjaid','2025-06-01T20:05:00.443Z','2025-06-01T20:05:05.117Z',0.07,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3b4pnju6mmjaid.webm'),('mbe3fn98zdpe25gyg','Audio_mbe3fn98zdpe25gyg','2025-06-01T20:08:31.100Z','2025-06-01T20:08:32.679Z',0.02,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3fn98zdpe25gyg.webm'),('mbe3fqj7u0ssria8n','Audio_mbe3fqj7u0ssria8n','2025-06-01T20:08:35.347Z','2025-06-01T20:08:37.395Z',0.03,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3fqj7u0ssria8n.webm'),('mbe3fsyts9ps079x6','Audio_mbe3fsyts9ps079x6','2025-06-01T20:08:38.501Z','2025-06-01T20:08:39.649Z',0.02,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3fsyts9ps079x6.webm'),('mbe3fusl485stix9l','Audio_mbe3fusl485stix9l','2025-06-01T20:08:40.869Z','2025-06-01T20:08:42.464Z',0.02,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3fusl485stix9l.webm'),('mbe3fwxww0j7qd7lt','Audio_mbe3fwxww0j7qd7lt','2025-06-01T20:08:43.652Z','2025-06-01T20:08:46.448Z',0.03,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3fwxww0j7qd7lt.webm'),('mbe3fzz8blju309d7','Audio_mbe3fzz8blju309d7','2025-06-01T20:08:47.588Z','2025-06-01T20:08:53.275Z',0.08,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3fzz8blju309d7.webm'),('mbe3ga6t1vztqkch1','Audio_mbe3ga6t1vztqkch1','2025-06-01T20:09:00.821Z','2025-06-01T20:09:02.268Z',0.02,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3ga6t1vztqkch1.webm'),('mbe3gdxt7bv26gg9w','Audio_mbe3gdxt7bv26gg9w','2025-06-01T20:09:05.681Z','2025-06-01T20:09:07.751Z',0.03,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3gdxt7bv26gg9w.webm'),('mbe3lzgybr7bxmrtv','Audio_mbe3lzgybr7bxmrtv','2025-06-01T20:13:26.866Z','2025-06-01T20:13:31.596Z',0.07,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3lzgybr7bxmrtv.webm'),('mbe3oecxx0wvh4xf7','Audio_mbe3oecxx0wvh4xf7','2025-06-01T20:15:19.473Z','2025-06-01T20:15:23.477Z',0.07,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3oecxx0wvh4xf7.webm'),('mbe3oil1fff99kx4u','Audio_mbe3oil1fff99kx4u','2025-06-01T20:15:24.949Z','2025-06-01T20:15:26.726Z',0.02,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3oil1fff99kx4u.webm'),('mbe3olqvcywj22n0c','Audio_mbe3olqvcywj22n0c','2025-06-01T20:15:29.047Z','2025-06-01T20:15:31.062Z',0.03,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3olqvcywj22n0c.webm'),('mbe3oo78z98t8zwo2','Audio_mbe3oo78z98t8zwo2','2025-06-01T20:15:32.228Z','2025-06-01T20:15:34.604Z',0.03,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3oo78z98t8zwo2.webm'),('mbe3p40wtmp543wqm','Audio_mbe3p40wtmp543wqm','2025-06-01T20:15:52.736Z','2025-06-01T20:15:55.787Z',0.05,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3p40wtmp543wqm.webm'),('mbe3p82bii4btjwm7','Audio_mbe3p82bii4btjwm7','2025-06-01T20:15:57.971Z','2025-06-01T20:16:01.303Z',0.05,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3p82bii4btjwm7.webm'),('mbe3pbjn6ow6tjruf','Audio_mbe3pbjn6ow6tjruf','2025-06-01T20:16:02.483Z','2025-06-01T20:16:05.408Z',0.03,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3pbjn6ow6tjruf.webm'),('mbe3qa552d0rywkfj','Audio_mbe3qa552d0rywkfj','2025-06-01T20:16:47.321Z','2025-06-01T20:16:52.776Z',0.08,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbe3qa552d0rywkfj.webm'),('mbe3tem2lko81q7yq','Audio_mbe3tem2lko81q7yq','2025-06-01T20:19:13.082Z','2025-06-01T20:19:15.652Z',0.03,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe3tem2lko81q7yq.webm'),('mbe3thf956bfczs8p','Audio_mbe3thf956bfczs8p','2025-06-01T20:19:16.725Z','2025-06-01T20:19:18.637Z',0.02,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe3thf956bfczs8p.webm'),('mbe3tkj7fpuyapt53','Audio_mbe3tkj7fpuyapt53','2025-06-01T20:19:20.755Z','2025-06-01T20:19:23.076Z',0.03,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe3tkj7fpuyapt53.webm'),('mbe40khdrlzkhg0hv','Audio_mbe40khdrlzkhg0hv','2025-06-01T20:24:47.281Z','2025-06-01T20:24:49.147Z',0.02,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe40khdrlzkhg0hv.webm'),('mbe41aymtj5xgvsk5','Audio_mbe41aymtj5xgvsk5','2025-06-01T20:25:21.598Z','2025-06-01T20:25:24.034Z',0.03,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe41aymtj5xgvsk5.webm'),('mbe41gadbqt1vy8qa','Audio_mbe41gadbqt1vy8qa','2025-06-01T20:25:28.501Z','2025-06-01T20:25:29.897Z',0.02,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe41gadbqt1vy8qa.webm'),('mbe41xbtzez0x9qdm','Audio_mbe41xbtzez0x9qdm','2025-06-01T20:25:50.585Z','2025-06-01T20:25:53.278Z',0.03,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe41xbtzez0x9qdm.webm'),('mbe421jpytjv9csjt','Audio_mbe421jpytjv9csjt','2025-06-01T20:25:56.053Z','2025-06-01T20:25:58.117Z',0.03,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe421jpytjv9csjt.webm'),('mbe42al5q1e2con1e','Audio_mbe42al5q1e2con1e','2025-06-01T20:26:07.769Z','2025-06-01T20:26:10.204Z',0.03,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe42al5q1e2con1e.webm'),('mbe42ddz66lauingj','Audio_mbe42ddz66lauingj','2025-06-01T20:26:11.399Z','2025-06-01T20:26:12.681Z',0.02,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe42ddz66lauingj.webm'),('mbe42f5a6zbboj1fu','Audio_mbe42f5a6zbboj1fu','2025-06-01T20:26:13.678Z','2025-06-01T20:26:14.995Z',0.02,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe42f5a6zbboj1fu.webm'),('mbe42gr5e0r33tki2','Audio_mbe42gr5e0r33tki2','2025-06-01T20:26:15.761Z','2025-06-01T20:26:16.841Z',0.02,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe42gr5e0r33tki2.webm'),('mbe42i2o3euhtrzd4','Audio_mbe42i2o3euhtrzd4','2025-06-01T20:26:17.472Z','2025-06-01T20:26:18.883Z',0.02,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe42i2o3euhtrzd4.webm'),('mbe42qtnkh42z4n8h','Audio_mbe42qtnkh42z4n8h','2025-06-01T20:26:28.811Z','2025-06-01T20:26:30.141Z',0.02,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe42qtnkh42z4n8h.webm'),('mbe42t1jevn9evbyg','Audio_mbe42t1jevn9evbyg','2025-06-01T20:26:31.688Z','2025-06-01T20:26:33.126Z',0.02,'4cb29b28e609dddc29785c6e02b402ca','users/4cb29b28e609dddc29785c6e02b402ca/recordings/Audio_mbe42t1jevn9evbyg.webm'),('mbe43m5cyrnl8xauh','Audio_mbe43m5cyrnl8xauh','2025-06-01T20:27:09.408Z','2025-06-01T20:27:11.091Z',0.02,'b1589976294d5d4cde3bda483f0da03e','users/b1589976294d5d4cde3bda483f0da03e/recordings/Audio_mbe43m5cyrnl8xauh.webm'),('mbeaedl69febro37n','Audio_mbeaedl69febro37n','2025-06-01T23:23:29.226Z','2025-06-01T23:23:31.640Z',0.03,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbeaedl69febro37n.webm'),('mbeg6hlxg9dzlcydd','Audio_mbeg6hlxg9dzlcydd','2025-06-02T02:05:18.885Z','2025-06-02T02:05:23.081Z',0.07,'afcebfc64f6b4517d018a842101717fa','users/afcebfc64f6b4517d018a842101717fa/recordings/Audio_mbeg6hlxg9dzlcydd.webm'),('mbega1vbt1s53iaz4','Audio_mbega1vbt1s53iaz4','2025-06-02T02:08:05.111Z','2025-06-02T02:08:08.548Z',0.05,'15afff30a692977996dd96f5ac10094a','users/15afff30a692977996dd96f5ac10094a/recordings/Audio_mbega1vbt1s53iaz4.webm');
/*!40000 ALTER TABLE `Audio` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `session`
--

DROP TABLE IF EXISTS `session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `session` (
  `sessionid` varchar(255) DEFAULT NULL,
  `userId` varchar(255) DEFAULT NULL,
  `login_time` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `session`
--

LOCK TABLES `session` WRITE;
/*!40000 ALTER TABLE `session` DISABLE KEYS */;
INSERT INTO `session` VALUES ('d3c576814a9078d2662a495f1aebf5c7','afcebfc64f6b4517d018a842101717fa','2025-05-31'),('c56cae81ad54cbc04bacd16c1de3d20b','afcebfc64f6b4517d018a842101717fa','2025-06-01'),('0f6f0c5efc0f5b50632733bccbf2b3d9','afcebfc64f6b4517d018a842101717fa','2025-06-01'),('80c32aee315b8fdb09cfe1965a9ece72','4cb29b28e609dddc29785c6e02b402ca','2025-06-01'),('47b8aadd5b93043ac49ef7987b36a932','4cb29b28e609dddc29785c6e02b402ca','2025-06-01'),('e037ca5c5eb8b9df332e95607b45c540','4cb29b28e609dddc29785c6e02b402ca','2025-06-01'),('c2636e36ba3d13f149f9a03efba23ef3','4cb29b28e609dddc29785c6e02b402ca','2025-06-01'),('e7345160852a5a4d4035fb1482e8a8b1','b1589976294d5d4cde3bda483f0da03e','2025-06-01'),('4f842c290adeafe2657fcfd6fa036c86','afcebfc64f6b4517d018a842101717fa','2025-06-01'),('1080b721499562f775d36306d1c6b26a','afcebfc64f6b4517d018a842101717fa','2025-06-01'),('39db9a0eda0953cc11540b86c5958bf9','15afff30a692977996dd96f5ac10094a','2025-06-01');
/*!40000 ALTER TABLE `session` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `user_id` varchar(255) NOT NULL,
  `username` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password_salt` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user`
--

LOCK TABLES `user` WRITE;
/*!40000 ALTER TABLE `user` DISABLE KEYS */;
INSERT INTO `user` VALUES ('15afff30a692977996dd96f5ac10094a','','566877786cfe8d064857f3c10819de0ffd126d84d30cddf9423da361ee2f25f1','','9002f2210365957e29081ddf1fb15b1d'),('4cb29b28e609dddc29785c6e02b402ca','test','9b5b33f84a4d0ad8700dafd553b0a8ec1c996b690756ed1fa59ebcf3d92963d1','test@test','108fdb1a9af31a7c73a3de735d25384c'),('9b1c240de14f19ca3e44da49e9932ed2','njzoia','6fe6b56560de4d6367a63b20aaf18f92e036e19af0b1ac433d480dc1a1ceb821','natnat@gmail.com','68292a8c09ad051679526088aab4f146'),('afcebfc64f6b4517d018a842101717fa','admin','c12bbb6882af1ee80ff78843ddf826e5454f39cda974d932c7af893f34718830','admin','879bdbda1bfaf6dee34619869aa15a11'),('b1589976294d5d4cde3bda483f0da03e','user1','a59165902be3920769f02ee5ff53aab1e7d5f75fb9231fa6df549e29c4b71234','user','da663631e7fba15bbc877795e0200382');
/*!40000 ALTER TABLE `user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `websocket_connection`
--

DROP TABLE IF EXISTS `websocket_connection`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `websocket_connection` (
  `userid` varchar(255) DEFAULT NULL,
  `sessionid` varchar(255) DEFAULT NULL,
  `connected_on` varchar(255) DEFAULT NULL,
  `webosocketid` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `websocket_connection`
--

LOCK TABLES `websocket_connection` WRITE;
/*!40000 ALTER TABLE `websocket_connection` DISABLE KEYS */;
INSERT INTO `websocket_connection` VALUES ('afcebfc64f6b4517d018a842101717fa','36bb3c170bc6f80cd8d6c8146c0cac01','2025-05-31','53454c45-4354-202a-2046-524f4d207573'),('4cb29b28e609dddc29785c6e02b402ca','1a676a3d15a452e058b20e36ae6a158c','2025-05-31','53454c45-4354-202a-2046-524f4d207573'),('9b1c240de14f19ca3e44da49e9932ed2','5c2439e36d8fc7f20c84b8660df2f53d','2025-05-31','53454c45-4354-202a-2046-524f4d207573'),('afcebfc64f6b4517d018a842101717fa','d3c576814a9078d2662a495f1aebf5c7','2025-05-31','53454c45-4354-202a-2046-524f4d207573'),('afcebfc64f6b4517d018a842101717fa','c56cae81ad54cbc04bacd16c1de3d20b','2025-06-01','53454c45-4354-202a-2046-524f4d207573'),('afcebfc64f6b4517d018a842101717fa','0f6f0c5efc0f5b50632733bccbf2b3d9','2025-06-01','53454c45-4354-202a-2046-524f4d207573'),('4cb29b28e609dddc29785c6e02b402ca','2f81bd084aa000565c3b67f80bbc8412','2025-06-01','53454c45-4354-202a-2046-524f4d207573'),('4cb29b28e609dddc29785c6e02b402ca','96523df7ed27055018f6e4647dcb67d9','2025-06-01','53454c45-4354-202a-2046-524f4d207573'),('4cb29b28e609dddc29785c6e02b402ca','96523df7ed27055018f6e4647dcb67d9','2025-06-01','53454c45-4354-202a-2046-524f4d207573'),('b1589976294d5d4cde3bda483f0da03e','e7345160852a5a4d4035fb1482e8a8b1','2025-06-01','53454c45-4354-202a-2046-524f4d207573'),('15afff30a692977996dd96f5ac10094a','39db9a0eda0953cc11540b86c5958bf9','2025-06-01','53454c45-4354-202a-2046-524f4d207573');
/*!40000 ALTER TABLE `websocket_connection` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-06-01 21:28:33
